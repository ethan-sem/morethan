import { ACTION_PLAN_VERSION, validateActionPlan } from "./actionPlan.js";
import { APPLICATION_TIER_PLAN_VERSION, validateApplicationTierPlan } from "./applicationTierPlan.js";
import { CAREER_PROFILE_ANALYSIS_VERSION } from "./careerProfileAnalysis.js";
import { JD_GAP_ANALYSIS_VERSION, validateJdGapAnalysis } from "./jdGapAnalysis.js";

export const CONCLUSION_PROVENANCE_VERSION = "1.0.0";
export const CONCLUSION_SOURCE_TYPES = Object.freeze(["confirmed_fact", "rule_inference", "public_source"]);
export const CONCLUSION_TARGET_TYPES = Object.freeze(["profile_conclusion", "jd_gap", "tier_lane", "action_item"]);

/** @typedef {typeof CONCLUSION_SOURCE_TYPES[number]} ConclusionSourceType */
/** @typedef {typeof CONCLUSION_TARGET_TYPES[number]} ConclusionTargetType */
/** @typedef {{ id: string, title: string, url: string, verifiedAt: string }} PublicSourceRef */
/** @typedef {{ targetType: ConclusionTargetType, targetId: string, sources: PublicSourceRef[] }} PublicSourceBinding */
/** @typedef {{ id: string, targetType: ConclusionTargetType, targetId: string, sourceTypes: ConclusionSourceType[], factIds: string[], ruleIds: string[], publicSources: PublicSourceRef[], explanation: string }} ConclusionProvenanceItem */
/** @typedef {{ schemaVersion: string, documentId: string, careerAnalysisVersion: string, jdGapAnalysisVersion: string | null, tierPlanVersion: string, actionPlanVersion: string, items: ConclusionProvenanceItem[], summary: { total: number, confirmedFact: number, ruleInference: number, publicSource: number }, disclaimer: string }} ConclusionProvenance */
/** @typedef {{ code: string, path: string }} ConclusionProvenanceValidationError */

export class ConclusionProvenanceError extends Error {
  /** @param {string} code @param {unknown[]} details */
  constructor(code, details = []) { super(code); this.name = "ConclusionProvenanceError"; this.code = code; this.details = details; }
}

/**
 * Builds display-only source annotations without mutating upstream analysis contracts.
 * Public-source labels are accepted only with an explicit URL and verification date.
 * @param {ReturnType<import("./careerProfileAnalysis.js").analyzeCareerProfile>} careerAnalysis
 * @param {import("./jdGapAnalysis.js").JdGapAnalysis | null} jdGapAnalysis
 * @param {import("./applicationTierPlan.js").ApplicationTierPlan} tierPlan
 * @param {import("./actionPlan.js").ActionPlan} actionPlan
 * @param {PublicSourceBinding[]=} publicSourceBindings
 * @returns {ConclusionProvenance}
 */
export function createConclusionProvenance(careerAnalysis, jdGapAnalysis, tierPlan, actionPlan, publicSourceBindings = []) {
  if (!careerAnalysis || careerAnalysis.schemaVersion !== CAREER_PROFILE_ANALYSIS_VERSION) throw new ConclusionProvenanceError("CAREER_ANALYSIS_INVALID");
  if (jdGapAnalysis) {
    const validation = validateJdGapAnalysis(jdGapAnalysis);
    if (!validation.valid) throw new ConclusionProvenanceError("JD_GAP_ANALYSIS_INVALID", validation.errors);
    if (jdGapAnalysis.documentId !== careerAnalysis.documentId) throw new ConclusionProvenanceError("ANALYSIS_DOCUMENT_MISMATCH");
  }
  const tierValidation = validateApplicationTierPlan(tierPlan);
  if (!tierValidation.valid) throw new ConclusionProvenanceError("TIER_PLAN_INVALID", tierValidation.errors);
  const actionValidation = validateActionPlan(actionPlan);
  if (!actionValidation.valid) throw new ConclusionProvenanceError("ACTION_PLAN_INVALID", actionValidation.errors);
  if (actionPlan.documentId !== careerAnalysis.documentId) throw new ConclusionProvenanceError("ACTION_DOCUMENT_MISMATCH");
  if (tierPlan.careerAnalysisVersion !== careerAnalysis.schemaVersion || tierPlan.jdGapAnalysisVersion !== (jdGapAnalysis?.schemaVersion ?? null) || actionPlan.careerAnalysisVersion !== careerAnalysis.schemaVersion || actionPlan.jdGapAnalysisVersion !== (jdGapAnalysis?.schemaVersion ?? null) || actionPlan.tierPlanVersion !== tierPlan.schemaVersion) throw new ConclusionProvenanceError("INPUT_VERSION_MISMATCH");

  const profileConclusions = [...careerAnalysis.strengths, ...careerAnalysis.gaps, ...careerAnalysis.insufficient];
  const validTargets = new Set([
    ...profileConclusions.map((item) => `profile_conclusion:${item.id}`),
    ...(jdGapAnalysis?.items.map((item) => `jd_gap:${item.id}`) ?? []),
    ...tierPlan.lanes.map((item) => `tier_lane:${item.id}`),
    ...actionPlan.items.map((item) => `action_item:${item.id}`),
  ]);
  const publicSources = indexPublicSources(publicSourceBindings, validTargets);
  /** @type {ConclusionProvenanceItem[]} */
  const items = [];
  profileConclusions.forEach((conclusion) => {
    items.push(makeItem("profile_conclusion", conclusion.id, conclusion.factIds, [conclusion.ruleId], publicSources));
  });
  jdGapAnalysis?.items.forEach((gap) => {
    items.push(makeItem("jd_gap", gap.id, gap.factRefs.map((ref) => ref.factId), [`jd_match:${gap.status}`], publicSources));
  });
  tierPlan.lanes.forEach((lane) => {
    items.push(makeItem("tier_lane", lane.id, lane.evidenceFactIds, [`tier:${lane.id}`, `strategy:${tierPlan.strategyBasis}`], publicSources));
  });
  actionPlan.items.forEach((action) => {
    items.push(makeItem("action_item", action.id, action.evidenceFactIds, [action.triggerRule], publicSources));
  });

  const result = {
    schemaVersion: CONCLUSION_PROVENANCE_VERSION,
    documentId: careerAnalysis.documentId,
    careerAnalysisVersion: careerAnalysis.schemaVersion,
    jdGapAnalysisVersion: jdGapAnalysis?.schemaVersion ?? null,
    tierPlanVersion: tierPlan.schemaVersion,
    actionPlanVersion: actionPlan.schemaVersion,
    items,
    summary: {
      total: items.length,
      confirmedFact: items.filter((item) => item.sourceTypes.includes("confirmed_fact")).length,
      ruleInference: items.filter((item) => item.sourceTypes.includes("rule_inference")).length,
      publicSource: items.filter((item) => item.sourceTypes.includes("public_source")).length,
    },
    disclaimer: "来源标记用于区分用户确认内容、浏览器规则推断和带链接的公开资料；规则推断不等于客观事实或录用保证。",
  };
  const validation = validateConclusionProvenance(result);
  if (!validation.valid) throw new ConclusionProvenanceError("CONCLUSION_PROVENANCE_INVALID", validation.errors);
  return result;
}

/** @param {ConclusionProvenance} provenance @param {ConclusionTargetType} targetType @param {string} targetId */
export function findConclusionProvenance(provenance, targetType, targetId) {
  return provenance.items.find((item) => item.targetType === targetType && item.targetId === targetId) ?? null;
}

/** @param {unknown} value @returns {{ valid: boolean, errors: ConclusionProvenanceValidationError[] }} */
export function validateConclusionProvenance(value) {
  /** @type {ConclusionProvenanceValidationError[]} */
  const errors = [];
  /** @param {string} code @param {string} path */
  const add = (code, path) => errors.push({ code, path });
  if (!isRecord(value)) return { valid: false, errors: [{ code: "ROOT_INVALID", path: "$" }] };
  allowed(value, ["schemaVersion", "documentId", "careerAnalysisVersion", "jdGapAnalysisVersion", "tierPlanVersion", "actionPlanVersion", "items", "summary", "disclaimer"], "$", "ROOT_KEY_UNKNOWN", add);
  if (value.schemaVersion !== CONCLUSION_PROVENANCE_VERSION) add("SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion");
  requiredString(value.documentId, "$.documentId", "DOCUMENT_ID_INVALID", add);
  if (value.careerAnalysisVersion !== CAREER_PROFILE_ANALYSIS_VERSION) add("CAREER_ANALYSIS_VERSION_UNSUPPORTED", "$.careerAnalysisVersion");
  if (value.jdGapAnalysisVersion !== null && value.jdGapAnalysisVersion !== JD_GAP_ANALYSIS_VERSION) add("JD_GAP_VERSION_UNSUPPORTED", "$.jdGapAnalysisVersion");
  if (value.tierPlanVersion !== APPLICATION_TIER_PLAN_VERSION) add("TIER_PLAN_VERSION_UNSUPPORTED", "$.tierPlanVersion");
  if (value.actionPlanVersion !== ACTION_PLAN_VERSION) add("ACTION_PLAN_VERSION_UNSUPPORTED", "$.actionPlanVersion");
  validateItems(value.items, add);
  validateSummary(value.summary, value.items, add);
  requiredString(value.disclaimer, "$.disclaimer", "DISCLAIMER_INVALID", add);
  return { valid: errors.length === 0, errors };
}

/** @param {ConclusionTargetType} targetType @param {string} targetId @param {string[]} factIds @param {string[]} ruleIds @param {Map<string, PublicSourceRef[]>} publicSources @returns {ConclusionProvenanceItem} */
function makeItem(targetType, targetId, factIds, ruleIds, publicSources) {
  const sources = publicSources.get(`${targetType}:${targetId}`) ?? [];
  /** @type {ConclusionSourceType[]} */
  const sourceTypes = ["rule_inference"];
  if (factIds.length) sourceTypes.unshift("confirmed_fact");
  if (sources.length) sourceTypes.push("public_source");
  return {
    id: `source-${targetType}-${targetId}`,
    targetType,
    targetId,
    sourceTypes,
    factIds: [...new Set(factIds)],
    ruleIds: [...new Set(ruleIds)],
    publicSources: sources,
    explanation: sourceTypes.includes("confirmed_fact")
      ? "该结论引用了用户已确认事实，并由本地规则形成判断。"
      : "该结论由本地规则形成，当前没有直接引用已确认事实。",
  };
}

/** @param {PublicSourceBinding[]} bindings @param {Set<string>} validTargets */
function indexPublicSources(bindings, validTargets) {
  if (!Array.isArray(bindings)) throw new ConclusionProvenanceError("PUBLIC_SOURCE_BINDINGS_INVALID");
  /** @type {Map<string, PublicSourceRef[]>} */
  const index = new Map();
  bindings.forEach((binding, bindingIndex) => {
    if (!isRecord(binding) || !CONCLUSION_TARGET_TYPES.includes(/** @type {ConclusionTargetType} */ (binding.targetType)) || typeof binding.targetId !== "string" || !binding.targetId || !Array.isArray(binding.sources)) {
      throw new ConclusionProvenanceError("PUBLIC_SOURCE_BINDING_INVALID", [{ bindingIndex }]);
    }
    const targetKey = `${binding.targetType}:${binding.targetId}`;
    if (!validTargets.has(targetKey)) throw new ConclusionProvenanceError("PUBLIC_SOURCE_TARGET_UNKNOWN", [{ bindingIndex }]);
    if (index.has(targetKey)) throw new ConclusionProvenanceError("PUBLIC_SOURCE_TARGET_DUPLICATE", [{ bindingIndex }]);
    binding.sources.forEach((source, sourceIndex) => {
      if (!isValidPublicSource(source)) throw new ConclusionProvenanceError("PUBLIC_SOURCE_INVALID", [{ bindingIndex, sourceIndex }]);
    });
    index.set(targetKey, binding.sources.map((source) => ({ ...source })));
  });
  return index;
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateItems(value, add) {
  if (!Array.isArray(value)) { add("ITEMS_INVALID", "$.items"); return; }
  const ids = new Set();
  const targets = new Set();
  value.forEach((item, index) => {
    const path = `$.items[${index}]`;
    if (!isRecord(item)) { add("ITEM_INVALID", path); return; }
    allowed(item, ["id", "targetType", "targetId", "sourceTypes", "factIds", "ruleIds", "publicSources", "explanation"], path, "ITEM_KEY_UNKNOWN", add);
    requiredString(item.id, `${path}.id`, "ITEM_ID_INVALID", add);
    if (typeof item.id === "string" && ids.has(item.id)) add("ITEM_ID_DUPLICATE", `${path}.id`); else if (typeof item.id === "string") ids.add(item.id);
    if (!CONCLUSION_TARGET_TYPES.includes(/** @type {ConclusionTargetType} */ (item.targetType))) add("TARGET_TYPE_INVALID", `${path}.targetType`);
    requiredString(item.targetId, `${path}.targetId`, "TARGET_ID_INVALID", add);
    const targetKey = `${String(item.targetType)}:${String(item.targetId)}`;
    if (targets.has(targetKey)) add("TARGET_DUPLICATE", path); else targets.add(targetKey);
    sourceTypeArray(item.sourceTypes, `${path}.sourceTypes`, add);
    stringArray(item.factIds, `${path}.factIds`, "FACT_IDS_INVALID", add, true);
    stringArray(item.ruleIds, `${path}.ruleIds`, "RULE_IDS_INVALID", add, false);
    validatePublicSources(item.publicSources, path, add);
    if (Array.isArray(item.sourceTypes)) {
      if (item.sourceTypes.includes("confirmed_fact") !== (Array.isArray(item.factIds) && item.factIds.length > 0)) add("CONFIRMED_FACT_SOURCE_MISMATCH", `${path}.sourceTypes`);
      if (item.sourceTypes.includes("public_source") !== (Array.isArray(item.publicSources) && item.publicSources.length > 0)) add("PUBLIC_SOURCE_MISMATCH", `${path}.sourceTypes`);
      if (!item.sourceTypes.includes("rule_inference")) add("RULE_SOURCE_MISSING", `${path}.sourceTypes`);
    }
    requiredString(item.explanation, `${path}.explanation`, "EXPLANATION_INVALID", add);
  });
}

/** @param {unknown} value @param {string} parent @param {(code: string, path: string) => void} add */
function validatePublicSources(value, parent, add) {
  const path = `${parent}.publicSources`;
  if (!Array.isArray(value)) { add("PUBLIC_SOURCES_INVALID", path); return; }
  value.forEach((source, index) => { if (!isValidPublicSource(source)) add("PUBLIC_SOURCE_INVALID", `${path}[${index}]`); });
}

/** @param {unknown} value @param {unknown} items @param {(code: string, path: string) => void} add */
function validateSummary(value, items, add) {
  if (!isRecord(value)) { add("SUMMARY_INVALID", "$.summary"); return; }
  allowed(value, ["total", "confirmedFact", "ruleInference", "publicSource"], "$.summary", "SUMMARY_KEY_UNKNOWN", add);
  /** @type {Record<string, number> | null} */
  const expected = Array.isArray(items) ? {
    total: items.length,
    confirmedFact: items.filter((item) => isRecord(item) && Array.isArray(item.sourceTypes) && item.sourceTypes.includes("confirmed_fact")).length,
    ruleInference: items.filter((item) => isRecord(item) && Array.isArray(item.sourceTypes) && item.sourceTypes.includes("rule_inference")).length,
    publicSource: items.filter((item) => isRecord(item) && Array.isArray(item.sourceTypes) && item.sourceTypes.includes("public_source")).length,
  } : null;
  for (const key of ["total", "confirmedFact", "ruleInference", "publicSource"]) if (!Number.isInteger(value[key]) || /** @type {number} */ (value[key]) < 0 || (expected && value[key] !== expected[key])) add("SUMMARY_VALUE_INVALID", `$.summary.${key}`);
}

/** @param {unknown} value */
function isValidPublicSource(value) {
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((key) => !["id", "title", "url", "verifiedAt"].includes(key))) return false;
  if (![value.id, value.title].every((entry) => typeof entry === "string" && entry.trim())) return false;
  if (typeof value.verifiedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.verifiedAt) || new Date(`${value.verifiedAt}T00:00:00.000Z`).toISOString().slice(0, 10) !== value.verifiedAt) return false;
  if (typeof value.url !== "string") return false;
  try { return new URL(value.url).protocol === "https:"; } catch { return false; }
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function sourceTypeArray(value, path, add) {
  if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length || value.some((entry) => !CONCLUSION_SOURCE_TYPES.includes(/** @type {ConclusionSourceType} */ (entry)))) add("SOURCE_TYPES_INVALID", path);
}
/** @param {Record<string, unknown>} value @param {readonly string[]} keys @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function allowed(value, keys, path, code, add) { Object.keys(value).forEach((key) => { if (!keys.includes(key)) add(code, `${path}.${key}`); }); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function requiredString(value, path, code, add) { if (typeof value !== "string" || !value.trim()) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add @param {boolean} allowEmpty */
function stringArray(value, path, code, add, allowEmpty) { if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || new Set(value).size !== value.length || value.some((entry) => typeof entry !== "string" || !entry.trim())) add(code, path); }
/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
