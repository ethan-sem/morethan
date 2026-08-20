import { validateJdProfile } from "./jdExtractor.js";
import { selectConfirmedFacts, validateResumeFacts } from "./resumeFacts.js";

export const JD_GAP_ANALYSIS_VERSION = "1.0.0";
export const JD_MATCH_STATUSES = Object.freeze(["covered", "partial", "not_found"]);

/** @typedef {import("./resumeFacts.js").ResumeFact} ResumeFact */
/** @typedef {import("./jdExtractor.js").JdItem} JdItem */
/** @typedef {{ factId: string, fieldPaths: string[], matchedKeywords: string[] }} JdFactRef */
/** @typedef {{ id: string, jdItemId: string, jdItemType: "responsibility" | "required" | "preferred", jdText: string, sourceLine: number, status: typeof JD_MATCH_STATUSES[number], score: number, matchedKeywords: string[], missingKeywords: string[], factRefs: JdFactRef[], interpretation: string, nextAction: string }} JdGapItem */
/** @typedef {{ schemaVersion: string, documentId: string, jdProfileVersion: string, factsConsideredIds: string[], items: JdGapItem[], summary: { total: number, covered: number, partial: number, notFound: number, requiredNotFound: number }, disclaimer: string }} JdGapAnalysis */
/** @typedef {{ code: string, path: string }} JdGapValidationError */

export class JdGapAnalysisError extends Error {
  /** @param {string} code @param {unknown[]} details */
  constructor(code, details = []) { super(code); this.name = "JdGapAnalysisError"; this.code = code; this.details = details; }
}

/**
 * Compares structured JD items with user-confirmed resume facts only.
 * A missing match means the resume does not contain evidence, not that the user lacks the capability.
 * @param {import("./resumeFacts.js").ResumeFacts} resumeFacts
 * @param {import("./jdExtractor.js").JdProfile} jdProfile
 * @returns {JdGapAnalysis}
 */
export function compareResumeToJd(resumeFacts, jdProfile) {
  const resumeValidation = validateResumeFacts(resumeFacts);
  if (!resumeValidation.valid) throw new JdGapAnalysisError("RESUME_FACTS_INVALID", resumeValidation.errors);
  const jdValidation = validateJdProfile(jdProfile);
  if (!jdValidation.valid) throw new JdGapAnalysisError("JD_PROFILE_INVALID", jdValidation.errors);

  const confirmedFacts = selectConfirmedFacts(resumeFacts);
  const searchableFacts = confirmedFacts.map(toSearchableFact);
  const sourceItems = [
    ...jdProfile.responsibilities.map((item) => ({ item, type: /** @type {const} */ ("responsibility") })),
    ...jdProfile.requirements.required.map((item) => ({ item, type: /** @type {const} */ ("required") })),
    ...jdProfile.requirements.preferred.map((item) => ({ item, type: /** @type {const} */ ("preferred") })),
  ];
  const items = sourceItems.map(({ item, type }) => compareItem(item, type, searchableFacts));
  const summary = {
    total: items.length,
    covered: items.filter((item) => item.status === "covered").length,
    partial: items.filter((item) => item.status === "partial").length,
    notFound: items.filter((item) => item.status === "not_found").length,
    requiredNotFound: items.filter((item) => item.jdItemType === "required" && item.status === "not_found").length,
  };
  const result = {
    schemaVersion: JD_GAP_ANALYSIS_VERSION,
    documentId: resumeFacts.document.id,
    jdProfileVersion: jdProfile.schemaVersion,
    factsConsideredIds: confirmedFacts.map((fact) => fact.id),
    items,
    summary,
    disclaimer: "匹配结果只说明已确认简历事实中是否存在相关证据；未找到证据不等于不具备能力，也不代表录取概率或录用保证。",
  };
  const validation = validateJdGapAnalysis(result);
  if (!validation.valid) throw new JdGapAnalysisError("JD_GAP_ANALYSIS_INVALID", validation.errors);
  return result;
}

/** @param {unknown} value @returns {{ valid: boolean, errors: JdGapValidationError[] }} */
export function validateJdGapAnalysis(value) {
  /** @type {JdGapValidationError[]} */
  const errors = [];
  /** @param {string} code @param {string} path */
  const add = (code, path) => errors.push({ code, path });
  if (!isRecord(value)) return { valid: false, errors: [{ code: "ROOT_INVALID", path: "$" }] };
  allowed(value, ["schemaVersion", "documentId", "jdProfileVersion", "factsConsideredIds", "items", "summary", "disclaimer"], "$", "ROOT_KEY_UNKNOWN", add);
  if (value.schemaVersion !== JD_GAP_ANALYSIS_VERSION) add("SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion");
  requiredString(value.documentId, "$.documentId", "DOCUMENT_ID_INVALID", add);
  requiredString(value.jdProfileVersion, "$.jdProfileVersion", "JD_PROFILE_VERSION_INVALID", add);
  stringArray(value.factsConsideredIds, "$.factsConsideredIds", "FACT_IDS_INVALID", add, true);
  validateItems(value.items, add);
  validateSummary(value.summary, value.items, add);
  requiredString(value.disclaimer, "$.disclaimer", "DISCLAIMER_INVALID", add);
  return { valid: errors.length === 0, errors };
}

/** @param {JdItem} item @param {"responsibility" | "required" | "preferred"} type @param {ReturnType<typeof toSearchableFact>[]} facts @returns {JdGapItem} */
function compareItem(item, type, facts) {
  const keywords = [...new Set(item.keywords)].filter((keyword) => !GENERIC_MATCH_TERMS.has(keyword.toLowerCase()));
  /** @type {Map<string, { paths: Set<string>, keywords: Set<string> }>} */
  const factHits = new Map();
  /** @type {Map<string, number>} */
  const keywordScores = new Map();

  keywords.forEach((keyword) => {
    facts.forEach((fact) => {
      fact.fields.forEach(({ path, value, quality }) => {
        if (!value.toLowerCase().includes(keyword.toLowerCase())) return;
        keywordScores.set(keyword, Math.max(keywordScores.get(keyword) ?? 0, quality));
        if (!factHits.has(fact.id)) factHits.set(fact.id, { paths: new Set(), keywords: new Set() });
        factHits.get(fact.id)?.paths.add(path);
        factHits.get(fact.id)?.keywords.add(keyword);
      });
    });
  });

  const matchedKeywords = keywords.filter((keyword) => keywordScores.has(keyword));
  const missingKeywords = keywords.filter((keyword) => !keywordScores.has(keyword));
  const score = keywords.length ? round(keywords.reduce((sum, keyword) => sum + (keywordScores.get(keyword) ?? 0), 0) / keywords.length) : 0;
  const status = score >= 0.75 ? "covered" : score > 0 ? "partial" : "not_found";
  const factRefs = [...factHits.entries()].map(([factId, hit]) => ({ factId, fieldPaths: [...hit.paths], matchedKeywords: [...hit.keywords] }));
  return {
    id: `jd-gap-${type}-${item.id}`,
    jdItemId: item.id,
    jdItemType: type,
    jdText: item.text,
    sourceLine: item.sourceLine,
    status,
    score,
    matchedKeywords,
    missingKeywords,
    factRefs,
    interpretation: status === "covered" ? "已确认事实中存在直接相关证据。" : status === "partial" ? "已确认事实中存在部分相关表达，但还不足以完整覆盖该项要求。" : "当前已确认简历事实中未找到可直接引用的相关证据。",
    nextAction: status === "covered" ? "投递前核对证据表述是否具体、准确并可追问。" : status === "partial" ? `补充${missingKeywords.length ? `“${missingKeywords.join("、")}”` : "该要求"}的使用场景、个人动作或结果。` : "如果你实际具备相关经历，请补充真实案例；如果没有，将其作为岗位选择或准备重点。",
  };
}

const GENERIC_MATCH_TERMS = new Set(["年", "天", "实习", "经验", "学历"]);

/** @param {ResumeFact} fact */
function toSearchableFact(fact) {
  /** @type {{ path: string, value: string, quality: number }[]} */
  const fields = [];
  Object.entries(fact.data).forEach(([path, value]) => {
    const quality = fact.category === "skill" && ["name", "keywords", "level"].includes(path) ? 0.55 : 1;
    if (typeof value === "string" && value.trim()) fields.push({ path, value, quality });
    if (Array.isArray(value)) value.forEach((entry) => { if (typeof entry === "string" && entry.trim()) fields.push({ path, value: entry, quality }); });
  });
  return { id: fact.id, fields };
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateItems(value, add) {
  if (!Array.isArray(value)) { add("ITEMS_INVALID", "$.items"); return; }
  const ids = new Set();
  value.forEach((item, index) => {
    const path = `$.items[${index}]`;
    if (!isRecord(item)) { add("ITEM_INVALID", path); return; }
    allowed(item, ["id", "jdItemId", "jdItemType", "jdText", "sourceLine", "status", "score", "matchedKeywords", "missingKeywords", "factRefs", "interpretation", "nextAction"], path, "ITEM_KEY_UNKNOWN", add);
    requiredString(item.id, `${path}.id`, "ITEM_ID_INVALID", add);
    if (typeof item.id === "string" && ids.has(item.id)) add("ITEM_ID_DUPLICATE", `${path}.id`); else if (typeof item.id === "string") ids.add(item.id);
    requiredString(item.jdItemId, `${path}.jdItemId`, "JD_ITEM_ID_INVALID", add);
    if (!["responsibility", "required", "preferred"].includes(/** @type {string} */ (item.jdItemType))) add("JD_ITEM_TYPE_INVALID", `${path}.jdItemType`);
    requiredString(item.jdText, `${path}.jdText`, "JD_TEXT_INVALID", add);
    if (!Number.isInteger(item.sourceLine) || /** @type {number} */ (item.sourceLine) < 1) add("SOURCE_LINE_INVALID", `${path}.sourceLine`);
    if (!JD_MATCH_STATUSES.includes(/** @type {typeof JD_MATCH_STATUSES[number]} */ (item.status))) add("MATCH_STATUS_INVALID", `${path}.status`);
    if (typeof item.score !== "number" || item.score < 0 || item.score > 1) add("MATCH_SCORE_INVALID", `${path}.score`);
    stringArray(item.matchedKeywords, `${path}.matchedKeywords`, "MATCHED_KEYWORDS_INVALID", add, true);
    stringArray(item.missingKeywords, `${path}.missingKeywords`, "MISSING_KEYWORDS_INVALID", add, true);
    validateFactRefs(item.factRefs, path, add);
    requiredString(item.interpretation, `${path}.interpretation`, "INTERPRETATION_INVALID", add);
    requiredString(item.nextAction, `${path}.nextAction`, "NEXT_ACTION_INVALID", add);
  });
}

/** @param {unknown} value @param {string} parent @param {(code: string, path: string) => void} add */
function validateFactRefs(value, parent, add) {
  const path = `${parent}.factRefs`;
  if (!Array.isArray(value)) { add("FACT_REFS_INVALID", path); return; }
  value.forEach((ref, index) => {
    const refPath = `${path}[${index}]`;
    if (!isRecord(ref)) { add("FACT_REF_INVALID", refPath); return; }
    allowed(ref, ["factId", "fieldPaths", "matchedKeywords"], refPath, "FACT_REF_KEY_UNKNOWN", add);
    requiredString(ref.factId, `${refPath}.factId`, "FACT_REF_ID_INVALID", add);
    stringArray(ref.fieldPaths, `${refPath}.fieldPaths`, "FACT_REF_FIELDS_INVALID", add, false);
    stringArray(ref.matchedKeywords, `${refPath}.matchedKeywords`, "FACT_REF_KEYWORDS_INVALID", add, false);
  });
}

/** @param {unknown} value @param {unknown} items @param {(code: string, path: string) => void} add */
function validateSummary(value, items, add) {
  if (!isRecord(value)) { add("SUMMARY_INVALID", "$.summary"); return; }
  allowed(value, ["total", "covered", "partial", "notFound", "requiredNotFound"], "$.summary", "SUMMARY_KEY_UNKNOWN", add);
  for (const key of ["total", "covered", "partial", "notFound", "requiredNotFound"]) if (!Number.isInteger(value[key]) || /** @type {number} */ (value[key]) < 0) add("SUMMARY_VALUE_INVALID", `$.summary.${key}`);
  if (Array.isArray(items) && typeof value.total === "number" && value.total !== items.length) add("SUMMARY_TOTAL_MISMATCH", "$.summary.total");
  const covered = typeof value.covered === "number" ? value.covered : null;
  const partial = typeof value.partial === "number" ? value.partial : null;
  const notFound = typeof value.notFound === "number" ? value.notFound : null;
  if (covered !== null && partial !== null && notFound !== null && covered + partial + notFound !== value.total) add("SUMMARY_STATUS_MISMATCH", "$.summary");
}

/** @param {Record<string, unknown>} value @param {string[]} keys @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function allowed(value, keys, path, code, add) { Object.keys(value).forEach((key) => { if (!keys.includes(key)) add(code, `${path}.${key}`); }); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function requiredString(value, path, code, add) { if (typeof value !== "string" || !value.trim()) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add @param {boolean} allowEmpty */
function stringArray(value, path, code, add, allowEmpty) { if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((entry) => typeof entry !== "string" || !entry.trim())) add(code, path); }
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
/** @param {number} value */
function round(value) { return Math.round(value * 100) / 100; }
