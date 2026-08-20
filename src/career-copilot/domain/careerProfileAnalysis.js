import { assertAnalysisRuleSet, createDefaultAnalysisRuleSet } from "./analysisRules.js";
import { selectConfirmedFacts, validateResumeFacts } from "./resumeFacts.js";
import { AUTO_ROLE_PROFILE_ID, getRoleProfile, normalizeRoleProfileId, ROLE_PROFILE_VERSION, ROLE_PROFILES } from "./roleProfiles.js";

export const CAREER_PROFILE_ANALYSIS_VERSION = "1.0.0";

/** @typedef {import("./resumeFacts.js").ResumeFact} ResumeFact */
/** @typedef {import("./analysisRules.js").AnalysisRuleSet} AnalysisRuleSet */
/** @typedef {{ factId: string, fieldPaths: string[] }} EvidenceFactRef */
/** @typedef {{ id: string, code: import("./analysisRules.js").AnalysisEvidenceCode, factRefs: EvidenceFactRef[], strength: number }} ProfileEvidence */
/** @typedef {{ id: string, type: "strength" | "gap" | "insufficient", claim: string, ruleId: string, metric: string, evidenceIds: string[], factIds: string[], confidence: "medium" | "low", score: number, caveat: string, nextAction: string }} ProfileConclusion */

/**
 * Builds a deterministic, memory-only direction and evidence profile.
 * Only facts explicitly confirmed by the user are eligible for evidence.
 * @param {import("./resumeFacts.js").ResumeFacts} resumeFacts
 * @param {{ targetDirection?: string, ruleSet?: AnalysisRuleSet }} options
 */
export function analyzeCareerProfile(resumeFacts, options = {}) {
  const resumeValidation = validateResumeFacts(resumeFacts);
  if (!resumeValidation.valid) throw new CareerProfileAnalysisError("RESUME_FACTS_INVALID", resumeValidation.errors);
  const ruleSet = assertAnalysisRuleSet(options.ruleSet ?? createDefaultAnalysisRuleSet());
  const confirmedFacts = selectConfirmedFacts(resumeFacts);
  const requestedDirection = normalizeRoleProfileId(options.targetDirection ?? AUTO_ROLE_PROFILE_ID);
  const directionMatches = scoreDirections(confirmedFacts);
  const selectedDirection = requestedDirection === AUTO_ROLE_PROFILE_ID ? directionMatches[0]?.id ?? null : requestedDirection;
  const selectedProfile = selectedDirection ? getRoleProfile(selectedDirection) : null;
  const evidence = buildEvidence(confirmedFacts, selectedProfile);
  const evidenceByCode = new Map(evidence.map((item) => [item.code, item]));
  const conclusions = ruleSet.rules.map((rule) => evaluateRule(rule, evidenceByCode, confirmedFacts.length));
  const strengths = conclusions.filter((item) => item.type === "strength").sort(rankConclusions).slice(0, ruleSet.limits.strengths);
  const gaps = conclusions.filter((item) => item.type === "gap").sort(rankConclusions).slice(0, ruleSet.limits.gaps);
  const insufficient = conclusions.filter((item) => item.type === "insufficient").sort(rankConclusions);

  return {
    schemaVersion: CAREER_PROFILE_ANALYSIS_VERSION,
    ruleSetVersion: ruleSet.ruleSetVersion,
    roleProfileVersion: ROLE_PROFILE_VERSION,
    documentId: resumeFacts.document.id,
    factsConsideredIds: confirmedFacts.map((fact) => fact.id),
    direction: {
      requested: requestedDirection,
      selected: selectedDirection,
      selectedLabel: selectedProfile?.label ?? null,
      status: selectedDirection && (directionMatches.find((item) => item.id === selectedDirection)?.score ?? 0) > 0 ? "matched" : "insufficient_evidence",
      matches: directionMatches.slice(0, 3),
    },
    evidence,
    strengths,
    gaps,
    insufficient,
    limits: { ...ruleSet.limits },
    disclaimer: "分析仅基于用户已确认且写入简历的事实；证据缺失不等于能力不足，结果不代表录取概率或 offer 保证。",
  };
}

/** @param {ResumeFact[]} facts */
function scoreDirections(facts) {
  return ROLE_PROFILES.map((profile) => {
    const matches = [];
    const factIds = new Set();
    for (const fact of facts) {
      const searchable = collectSearchableFields(fact);
      for (const keyword of [...profile.taskKeywords, ...profile.skillKeywords]) {
        if (searchable.some(({ value }) => value.toLowerCase().includes(keyword.toLowerCase()))) {
          matches.push(keyword);
          factIds.add(fact.id);
        }
      }
    }
    const matchedKeywords = [...new Set(matches)];
    const denominator = Math.min(6, profile.taskKeywords.length + profile.skillKeywords.length);
    const score = round(Math.min(1, matchedKeywords.length / denominator));
    return { id: profile.id, label: profile.label, score, confidence: score >= 0.5 ? "medium" : "low", matchedKeywords, factIds: [...factIds] };
  }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

/** @param {ResumeFact[]} facts @param {ReturnType<typeof getRoleProfile>} profile @returns {ProfileEvidence[]} */
function buildEvidence(facts, profile) {
  /** @type {Map<string, Map<string, Set<string>>>} */
  const hits = new Map();
  /** @param {string} code @param {ResumeFact} fact @param {string[]} paths */
  const add = (code, fact, paths) => {
    if (!paths.length) return;
    if (!hits.has(code)) hits.set(code, new Map());
    const factMap = /** @type {Map<string, Set<string>>} */ (hits.get(code));
    if (!factMap.has(fact.id)) factMap.set(fact.id, new Set());
    paths.forEach((path) => factMap.get(fact.id)?.add(path));
  };

  facts.forEach((fact) => {
    const data = fact.data;
    const actions = populatedArray(data.actions);
    const methods = populatedArray(data.methods);
    const technologies = populatedArray(data.technologies);
    const results = populatedArray(data.results);
    const metrics = populatedArray(data.metrics);
    const highlights = populatedArray(data.highlights);
    const role = populatedString(data.role);
    const skillName = fact.category === "skill" ? populatedString(data.name) : false;
    const achievement = fact.category === "achievement" && (populatedString(data.title) || populatedString(data.description));

    if (actions) add("E-ACTION", fact, ["actions"]);
    if (methods || technologies || skillName) add("E-METHOD", fact, [methods ? "methods" : "", technologies ? "technologies" : "", skillName ? "name" : ""].filter(Boolean));
    if (results || achievement) add("E-RESULT", fact, [results ? "results" : "", populatedString(data.description) ? "description" : "", achievement && populatedString(data.title) ? "title" : ""].filter(Boolean));
    if (metrics || containsScale([...arrayValues(data.results), ...arrayValues(data.actions), ...arrayValues(data.highlights)])) add("E-SCALE", fact, [metrics ? "metrics" : "", results ? "results" : "", actions ? "actions" : "", highlights ? "highlights" : ""].filter(Boolean));
    if (role && actions) add("E-OWNERSHIP", fact, ["role", "actions"]);
    if (isCredibleFact(fact)) add("E-CREDIBILITY", fact, credibilityPaths(fact));
    if (profile) {
      const paths = collectSearchableFields(fact).filter(({ value }) => [...profile.taskKeywords, ...profile.skillKeywords].some((keyword) => value.toLowerCase().includes(keyword.toLowerCase()))).map(({ path }) => path);
      add("E-RELEVANCE", fact, [...new Set(paths)]);
    }
  });

  return [...hits.entries()].map(([code, factMap]) => ({
    id: `evidence-${code.toLowerCase()}`,
    code: /** @type {import("./analysisRules.js").AnalysisEvidenceCode} */ (code),
    factRefs: [...factMap.entries()].map(([factId, paths]) => ({ factId, fieldPaths: [...paths] })),
    strength: round(Math.min(1, 0.5 + Math.max(0, factMap.size - 1) * 0.15)),
  }));
}

/** @param {import("./analysisRules.js").AnalysisRule} rule @param {Map<string, ProfileEvidence>} evidenceByCode @param {number} factCount @returns {ProfileConclusion} */
function evaluateRule(rule, evidenceByCode, factCount) {
  const requiredHits = rule.evidence.required.filter((code) => evidenceByCode.has(code));
  const supportingHits = rule.evidence.supporting.filter((code) => evidenceByCode.has(code));
  const requiredCoverage = requiredHits.length / rule.evidence.required.length;
  const supportingCoverage = rule.evidence.supporting.length ? supportingHits.length / rule.evidence.supporting.length : 0;
  const score = round(requiredCoverage * 0.7 + supportingCoverage * 0.3);
  const evidenceItems = [...requiredHits, ...supportingHits].map((code) => evidenceByCode.get(code)).filter(Boolean);
  const evidenceIds = evidenceItems.map((item) => /** @type {ProfileEvidence} */ (item).id);
  const factIds = [...new Set(evidenceItems.flatMap((item) => /** @type {ProfileEvidence} */ (item).factRefs.map((ref) => ref.factId)))];
  const missingRequired = requiredHits.length < rule.evidence.required.length;
  const evidenceCount = evidenceIds.length;
  const insufficient = factCount < rule.degradation.minimumConfirmedFacts || evidenceCount < rule.degradation.minimumEvidenceCount;
  const type = insufficient ? "insufficient" : !missingRequired && score >= rule.thresholds.adequate ? "strength" : "gap";
  const claim = type === "strength" ? rule.explanation.strength : type === "gap" ? rule.explanation.gap : rule.explanation.insufficient;
  return {
    id: `conclusion-${rule.id}`,
    type,
    claim,
    ruleId: rule.id,
    metric: rule.metric,
    evidenceIds,
    factIds,
    confidence: score >= rule.thresholds.adequate ? "medium" : "low",
    score,
    caveat: rule.explanation.caveat,
    nextAction: degradationText(missingRequired ? rule.degradation.onMissingRequiredEvidence : rule.degradation.onInsufficientEvidence, rule.label),
  };
}

/** @param {ProfileConclusion} left @param {ProfileConclusion} right */
function rankConclusions(left, right) { return right.score - left.score || left.ruleId.localeCompare(right.ruleId); }
/** @param {string} action @param {string} label */
function degradationText(action, label) {
  if (action === "ask_user") return `补充或确认与“${label}”相关的具体事实后再判断。`;
  if (action === "omit_conclusion") return `证据不足时不输出“${label}”结论。`;
  return `基于当前已确认事实，仅对“${label}”给出条件式建议。`;
}

/** @param {ResumeFact} fact */
function collectSearchableFields(fact) {
  /** @type {{ path: string, value: string }[]} */
  const fields = [];
  Object.entries(fact.data).forEach(([path, value]) => {
    if (typeof value === "string" && value.trim()) fields.push({ path, value });
    if (Array.isArray(value)) value.forEach((item) => { if (typeof item === "string" && item.trim()) fields.push({ path, value: item }); });
  });
  return fields;
}

/** @param {ResumeFact} fact */
function isCredibleFact(fact) {
  const hasDate = Boolean(fact.data.dateRange || fact.data.issuedAt || fact.data.receivedAt);
  const detailCount = collectSearchableFields(fact).length;
  return hasDate && detailCount >= 2 || detailCount >= 4;
}
/** @param {ResumeFact} fact */
function credibilityPaths(fact) {
  const paths = collectSearchableFields(fact).map(({ path }) => path).slice(0, 4);
  if (fact.data.dateRange) paths.push("dateRange");
  return [...new Set(paths)];
}
/** @param {unknown} value */
function populatedArray(value) { return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim()); }
/** @param {unknown} value */
function populatedString(value) { return typeof value === "string" && value.trim().length > 0; }
/** @param {unknown} value */
function arrayValues(value) { return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []; }
/** @param {string[]} values */
function containsScale(values) { return values.some((value) => /\d+(?:\.\d+)?\s*(?:%|人|万|千|百|个|次|家|项|天|周|月|元|小时|场|份|条|GB|MB)/i.test(value)); }
/** @param {number} value */
function round(value) { return Math.round(value * 100) / 100; }

export class CareerProfileAnalysisError extends Error {
  /** @param {string} code @param {unknown[]} details */
  constructor(code, details = []) { super(code); this.name = "CareerProfileAnalysisError"; this.code = code; this.details = details; }
}
