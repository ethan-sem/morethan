export const ANALYSIS_RULES_SCHEMA_VERSION = "1.0.0";
export const DEFAULT_ANALYSIS_RULESET_VERSION = "2026.08.1";

export const ANALYSIS_EVIDENCE_CODES = Object.freeze([
  "E-ACTION",
  "E-METHOD",
  "E-RESULT",
  "E-SCALE",
  "E-OWNERSHIP",
  "E-RELEVANCE",
  "E-CREDIBILITY",
]);

export const ANALYSIS_OUTCOMES = Object.freeze(["strength", "gap", "insufficient"]);
export const ANALYSIS_DEGRADATION_ACTIONS = Object.freeze(["ask_user", "conditional_advice", "omit_conclusion"]);
export const ANALYSIS_CONFIDENCE_CAPS = Object.freeze(["high", "medium", "low"]);

/** @typedef {typeof ANALYSIS_EVIDENCE_CODES[number]} AnalysisEvidenceCode */
/** @typedef {typeof ANALYSIS_DEGRADATION_ACTIONS[number]} AnalysisDegradationAction */
/** @typedef {{ id: AnalysisEvidenceCode, label: string, description: string, factCategories: string[], fieldPaths: string[] }} AnalysisEvidenceDefinition */
/** @typedef {{ strong: number, adequate: number, weak: number }} AnalysisThresholds */
/** @typedef {{ strength: string, gap: string, insufficient: string, caveat: string }} AnalysisExplanation */
/** @typedef {{ minimumConfirmedFacts: number, minimumEvidenceCount: number, onInsufficientEvidence: AnalysisDegradationAction, onMissingRequiredEvidence: AnalysisDegradationAction, confidenceCap: typeof ANALYSIS_CONFIDENCE_CAPS[number] }} AnalysisDegradation */
/** @typedef {{ id: string, metric: string, label: string, description: string, evidence: { required: AnalysisEvidenceCode[], supporting: AnalysisEvidenceCode[] }, weight: number, thresholds: AnalysisThresholds, explanation: AnalysisExplanation, degradation: AnalysisDegradation }} AnalysisRule */
/** @typedef {{ schemaVersion: string, ruleSetVersion: string, id: string, stage: ("internship" | "campus")[], locale: string, evidenceCatalog: AnalysisEvidenceDefinition[], rules: AnalysisRule[], aggregation: { method: "weighted_mean", roundingDigits: number, exposeCompositeScore: false }, limits: { strengths: number, gaps: number, actions: number }, metadata: { title: string, reviewedAt: string, changeReason: string } }} AnalysisRuleSet */
/** @typedef {{ code: string, path: string }} AnalysisRuleValidationError */

const FACT_CATEGORIES = Object.freeze(["education", "internship", "project", "campus", "skill", "certification", "achievement"]);
const STAGES = Object.freeze(["internship", "campus"]);

const EVIDENCE_CATALOG = Object.freeze([
  { id: "E-ACTION", label: "个人动作", description: "事实中存在可归因于候选人的具体动作。", factCategories: ["internship", "project", "campus"], fieldPaths: ["actions"] },
  { id: "E-METHOD", label: "方法与工具", description: "事实说明完成任务所用的方法、工具或决策过程。", factCategories: ["internship", "project", "skill"], fieldPaths: ["methods", "technologies", "name"] },
  { id: "E-RESULT", label: "结果", description: "事实包含产出、变化或业务结果。", factCategories: ["internship", "project", "campus", "achievement"], fieldPaths: ["results", "description"] },
  { id: "E-SCALE", label: "规模", description: "事实包含用户、金额、时间、团队或数据规模。", factCategories: ["internship", "project", "campus"], fieldPaths: ["metrics", "results"] },
  { id: "E-OWNERSHIP", label: "个人贡献", description: "角色与动作足以区分个人贡献和团队成果。", factCategories: ["internship", "project", "campus"], fieldPaths: ["role", "actions"] },
  { id: "E-RELEVANCE", label: "岗位相关性", description: "事实可映射到目标岗位的任务或技能。", factCategories: [...FACT_CATEGORIES], fieldPaths: ["role", "actions", "methods", "keywords", "name"] },
  { id: "E-CREDIBILITY", label: "可信度", description: "事实具体、前后一致，并具备可追问的细节。", factCategories: [...FACT_CATEGORIES], fieldPaths: ["dateRange", "actions", "results", "issuer"] },
]);

const BASE_RULES = Object.freeze([
  rule("rule-action", "action_clarity", "动作清晰度", "判断经历是否说明候选人亲自做了什么。", ["E-ACTION"], ["E-OWNERSHIP"], 0.18, "动作具体且可归因。", "经历缺少具体个人动作。", "当前事实不足以判断个人动作。"),
  rule("rule-method", "method_depth", "方法深度", "判断经历是否说明方法、工具或决策过程。", ["E-METHOD"], ["E-ACTION", "E-CREDIBILITY"], 0.14, "方法和工具有明确使用场景。", "方法或工具缺少使用过程。", "当前事实不足以判断方法深度。"),
  rule("rule-result", "result_evidence", "结果证据", "判断经历是否包含可解释的结果证据。", ["E-RESULT"], ["E-SCALE", "E-CREDIBILITY"], 0.2, "结果具体且具有可验证细节。", "经历描述缺少结果证据。", "当前事实不足以判断实际结果。"),
  rule("rule-scale", "impact_scale", "影响规模", "判断结果是否包含影响范围或量化规模。", ["E-SCALE"], ["E-RESULT"], 0.1, "影响范围或规模表达清楚。", "结果缺少规模或影响范围。", "当前事实不足以判断影响规模。"),
  rule("rule-ownership", "ownership", "个人贡献", "判断团队结果能否合理归因到候选人的职责和动作。", ["E-OWNERSHIP"], ["E-ACTION", "E-RESULT"], 0.14, "个人角色和贡献边界清楚。", "个人贡献与团队成果边界不清。", "当前事实不足以判断个人贡献。"),
  rule("rule-relevance", "role_relevance", "岗位相关性", "判断已确认事实与目标岗位任务的映射程度。", ["E-RELEVANCE"], ["E-ACTION", "E-METHOD"], 0.16, "经历与目标岗位任务存在直接映射。", "现有证据与目标岗位任务的映射较弱。", "缺少目标方向或相关事实，暂不能判断岗位相关性。"),
  rule("rule-credibility", "credibility", "表达可信度", "判断事实是否具体、一致且能够被进一步追问。", ["E-CREDIBILITY"], ["E-ACTION", "E-RESULT"], 0.08, "事实具体、一致且可追问。", "表达较笼统或存在需要核实的信息。", "当前事实不足以判断表达可信度。"),
]);

/** @returns {AnalysisRuleSet} */
export function createDefaultAnalysisRuleSet() {
  return /** @type {AnalysisRuleSet} */ (clone({
    schemaVersion: ANALYSIS_RULES_SCHEMA_VERSION,
    ruleSetVersion: DEFAULT_ANALYSIS_RULESET_VERSION,
    id: "morethan-campus-general",
    stage: ["internship", "campus"],
    locale: "zh-CN",
    evidenceCatalog: EVIDENCE_CATALOG,
    rules: BASE_RULES,
    aggregation: { method: "weighted_mean", roundingDigits: 2, exposeCompositeScore: false },
    limits: { strengths: 3, gaps: 3, actions: 5 },
    metadata: { title: "MoreThan 实习校招通用证据规则", reviewedAt: "2026-08-13", changeReason: "M4-01 建立首版规则契约" },
  }));
}

/** @param {unknown} value @returns {{ valid: boolean, errors: AnalysisRuleValidationError[] }} */
export function validateAnalysisRuleSet(value) {
  /** @type {AnalysisRuleValidationError[]} */
  const errors = [];
  /** @param {string} code @param {string} path */
  const add = (code, path) => errors.push({ code, path });
  if (!isRecord(value)) return { valid: false, errors: [{ code: "ROOT_INVALID", path: "$" }] };

  allowed(value, ["schemaVersion", "ruleSetVersion", "id", "stage", "locale", "evidenceCatalog", "rules", "aggregation", "limits", "metadata"], "$", "ROOT_KEY_UNKNOWN", add);
  if (value.schemaVersion !== ANALYSIS_RULES_SCHEMA_VERSION) add("SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion");
  requiredString(value.ruleSetVersion, "$.ruleSetVersion", "RULESET_VERSION_INVALID", add);
  requiredString(value.id, "$.id", "RULESET_ID_INVALID", add);
  if (!Array.isArray(value.stage) || value.stage.length === 0 || value.stage.some((item) => !STAGES.includes(/** @type {string} */ (item)))) add("STAGE_INVALID", "$.stage");
  requiredString(value.locale, "$.locale", "LOCALE_INVALID", add);

  const evidenceIds = validateEvidenceCatalog(value.evidenceCatalog, add);
  validateRules(value.rules, evidenceIds, add);
  validateAggregation(value.aggregation, add);
  validateLimits(value.limits, add);
  validateMetadata(value.metadata, add);
  return { valid: errors.length === 0, errors };
}

/** @param {AnalysisRuleSet} ruleSet @returns {AnalysisRuleSet} */
export function assertAnalysisRuleSet(ruleSet) {
  const result = validateAnalysisRuleSet(ruleSet);
  if (!result.valid) throw new AnalysisRuleSetError("ANALYSIS_RULESET_INVALID", result.errors);
  return ruleSet;
}

/** @param {string} id @param {string} metric @param {string} label @param {string} description @param {AnalysisEvidenceCode[]} required @param {AnalysisEvidenceCode[]} supporting @param {number} weight @param {string} strength @param {string} gap @param {string} insufficient @returns {AnalysisRule} */
function rule(id, metric, label, description, required, supporting, weight, strength, gap, insufficient) {
  return {
    id,
    metric,
    label,
    description,
    evidence: { required, supporting },
    weight,
    thresholds: { strong: 0.75, adequate: 0.5, weak: 0.25 },
    explanation: { strength, gap, insufficient, caveat: "仅基于用户已确认且写入简历的事实，不代表真实能力上限或录用结果。" },
    degradation: { minimumConfirmedFacts: 1, minimumEvidenceCount: 1, onInsufficientEvidence: "conditional_advice", onMissingRequiredEvidence: "ask_user", confidenceCap: "medium" },
  };
}

/** @param {unknown} value @param {(code: string, path: string) => void} add @returns {Set<string>} */
function validateEvidenceCatalog(value, add) {
  const ids = new Set();
  if (!Array.isArray(value) || value.length === 0) { add("EVIDENCE_CATALOG_INVALID", "$.evidenceCatalog"); return ids; }
  value.forEach((item, index) => {
    const path = `$.evidenceCatalog[${index}]`;
    if (!isRecord(item)) { add("EVIDENCE_INVALID", path); return; }
    allowed(item, ["id", "label", "description", "factCategories", "fieldPaths"], path, "EVIDENCE_KEY_UNKNOWN", add);
    if (!ANALYSIS_EVIDENCE_CODES.includes(/** @type {AnalysisEvidenceCode} */ (item.id))) add("EVIDENCE_ID_UNSUPPORTED", `${path}.id`);
    else if (ids.has(item.id)) add("EVIDENCE_ID_DUPLICATE", `${path}.id`);
    else ids.add(item.id);
    requiredString(item.label, `${path}.label`, "EVIDENCE_LABEL_INVALID", add);
    requiredString(item.description, `${path}.description`, "EVIDENCE_DESCRIPTION_INVALID", add);
    stringArray(item.factCategories, `${path}.factCategories`, "EVIDENCE_CATEGORIES_INVALID", add, FACT_CATEGORIES);
    stringArray(item.fieldPaths, `${path}.fieldPaths`, "EVIDENCE_FIELDS_INVALID", add);
  });
  return ids;
}

/** @param {unknown} value @param {Set<string>} evidenceIds @param {(code: string, path: string) => void} add */
function validateRules(value, evidenceIds, add) {
  if (!Array.isArray(value) || value.length === 0) { add("RULES_INVALID", "$.rules"); return; }
  const ids = new Set();
  let totalWeight = 0;
  value.forEach((item, index) => {
    const path = `$.rules[${index}]`;
    if (!isRecord(item)) { add("RULE_INVALID", path); return; }
    allowed(item, ["id", "metric", "label", "description", "evidence", "weight", "thresholds", "explanation", "degradation"], path, "RULE_KEY_UNKNOWN", add);
    requiredString(item.id, `${path}.id`, "RULE_ID_INVALID", add);
    if (typeof item.id === "string" && ids.has(item.id)) add("RULE_ID_DUPLICATE", `${path}.id`); else if (typeof item.id === "string") ids.add(item.id);
    requiredString(item.metric, `${path}.metric`, "RULE_METRIC_INVALID", add);
    requiredString(item.label, `${path}.label`, "RULE_LABEL_INVALID", add);
    requiredString(item.description, `${path}.description`, "RULE_DESCRIPTION_INVALID", add);
    validateEvidenceRefs(item.evidence, path, evidenceIds, add);
    if (!numberInRange(item.weight, 0, 1, false)) add("RULE_WEIGHT_INVALID", `${path}.weight`); else totalWeight += /** @type {number} */ (item.weight);
    validateThresholds(item.thresholds, path, add);
    validateExplanation(item.explanation, path, add);
    validateDegradation(item.degradation, path, add);
  });
  if (Math.abs(totalWeight - 1) > 0.000001) add("RULE_WEIGHTS_NOT_NORMALIZED", "$.rules");
}

/** @param {unknown} value @param {string} parent @param {Set<string>} ids @param {(code: string, path: string) => void} add */
function validateEvidenceRefs(value, parent, ids, add) {
  const path = `${parent}.evidence`;
  if (!isRecord(value)) { add("RULE_EVIDENCE_INVALID", path); return; }
  allowed(value, ["required", "supporting"], path, "RULE_EVIDENCE_KEY_UNKNOWN", add);
  for (const key of ["required", "supporting"]) {
    const refs = value[key];
    if (!Array.isArray(refs) || (key === "required" && refs.length === 0) || refs.some((id) => typeof id !== "string")) add("RULE_EVIDENCE_REFS_INVALID", `${path}.${key}`);
    else refs.forEach((id, index) => { if (!ids.has(id)) add("RULE_EVIDENCE_REF_UNKNOWN", `${path}.${key}[${index}]`); });
  }
}

/** @param {unknown} value @param {string} parent @param {(code: string, path: string) => void} add */
function validateThresholds(value, parent, add) {
  const path = `${parent}.thresholds`;
  if (!isRecord(value)) { add("RULE_THRESHOLDS_INVALID", path); return; }
  allowed(value, ["strong", "adequate", "weak"], path, "RULE_THRESHOLDS_KEY_UNKNOWN", add);
  const { strong, adequate, weak } = value;
  if (![strong, adequate, weak].every((item) => numberInRange(item, 0, 1, true))) add("RULE_THRESHOLD_VALUE_INVALID", path);
  else if (!(/** @type {number} */ (strong) > /** @type {number} */ (adequate) && /** @type {number} */ (adequate) > /** @type {number} */ (weak))) add("RULE_THRESHOLDS_ORDER_INVALID", path);
}

/** @param {unknown} value @param {string} parent @param {(code: string, path: string) => void} add */
function validateExplanation(value, parent, add) {
  const path = `${parent}.explanation`;
  if (!isRecord(value)) { add("RULE_EXPLANATION_INVALID", path); return; }
  allowed(value, ["strength", "gap", "insufficient", "caveat"], path, "RULE_EXPLANATION_KEY_UNKNOWN", add);
  for (const key of ["strength", "gap", "insufficient", "caveat"]) requiredString(value[key], `${path}.${key}`, "RULE_EXPLANATION_TEXT_INVALID", add);
}

/** @param {unknown} value @param {string} parent @param {(code: string, path: string) => void} add */
function validateDegradation(value, parent, add) {
  const path = `${parent}.degradation`;
  if (!isRecord(value)) { add("RULE_DEGRADATION_INVALID", path); return; }
  allowed(value, ["minimumConfirmedFacts", "minimumEvidenceCount", "onInsufficientEvidence", "onMissingRequiredEvidence", "confidenceCap"], path, "RULE_DEGRADATION_KEY_UNKNOWN", add);
  if (!nonNegativeInteger(value.minimumConfirmedFacts)) add("RULE_MINIMUM_FACTS_INVALID", `${path}.minimumConfirmedFacts`);
  if (!nonNegativeInteger(value.minimumEvidenceCount)) add("RULE_MINIMUM_EVIDENCE_INVALID", `${path}.minimumEvidenceCount`);
  if (!ANALYSIS_DEGRADATION_ACTIONS.includes(/** @type {AnalysisDegradationAction} */ (value.onInsufficientEvidence))) add("RULE_INSUFFICIENT_ACTION_INVALID", `${path}.onInsufficientEvidence`);
  if (!ANALYSIS_DEGRADATION_ACTIONS.includes(/** @type {AnalysisDegradationAction} */ (value.onMissingRequiredEvidence))) add("RULE_MISSING_ACTION_INVALID", `${path}.onMissingRequiredEvidence`);
  if (!ANALYSIS_CONFIDENCE_CAPS.includes(/** @type {typeof ANALYSIS_CONFIDENCE_CAPS[number]} */ (value.confidenceCap))) add("RULE_CONFIDENCE_CAP_INVALID", `${path}.confidenceCap`);
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateAggregation(value, add) {
  if (!isRecord(value)) { add("AGGREGATION_INVALID", "$.aggregation"); return; }
  allowed(value, ["method", "roundingDigits", "exposeCompositeScore"], "$.aggregation", "AGGREGATION_KEY_UNKNOWN", add);
  if (value.method !== "weighted_mean") add("AGGREGATION_METHOD_UNSUPPORTED", "$.aggregation.method");
  if (!Number.isInteger(value.roundingDigits) || /** @type {number} */ (value.roundingDigits) < 0 || /** @type {number} */ (value.roundingDigits) > 4) add("AGGREGATION_ROUNDING_INVALID", "$.aggregation.roundingDigits");
  if (value.exposeCompositeScore !== false) add("COMPOSITE_SCORE_MUST_BE_HIDDEN", "$.aggregation.exposeCompositeScore");
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateLimits(value, add) {
  if (!isRecord(value)) { add("LIMITS_INVALID", "$.limits"); return; }
  allowed(value, ["strengths", "gaps", "actions"], "$.limits", "LIMITS_KEY_UNKNOWN", add);
  for (const key of ["strengths", "gaps", "actions"]) if (!Number.isInteger(value[key]) || /** @type {number} */ (value[key]) < 1) add("LIMIT_INVALID", `$.limits.${key}`);
  if (typeof value.strengths === "number" && value.strengths > 3) add("STRENGTH_LIMIT_EXCEEDED", "$.limits.strengths");
  if (typeof value.gaps === "number" && value.gaps > 3) add("GAP_LIMIT_EXCEEDED", "$.limits.gaps");
  if (typeof value.actions === "number" && value.actions > 5) add("ACTION_LIMIT_EXCEEDED", "$.limits.actions");
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateMetadata(value, add) {
  if (!isRecord(value)) { add("METADATA_INVALID", "$.metadata"); return; }
  allowed(value, ["title", "reviewedAt", "changeReason"], "$.metadata", "METADATA_KEY_UNKNOWN", add);
  requiredString(value.title, "$.metadata.title", "METADATA_TITLE_INVALID", add);
  requiredString(value.changeReason, "$.metadata.changeReason", "METADATA_CHANGE_REASON_INVALID", add);
  if (typeof value.reviewedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.reviewedAt)) add("METADATA_REVIEWED_AT_INVALID", "$.metadata.reviewedAt");
}

/** @param {Record<string, unknown>} value @param {string[]} keys @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function allowed(value, keys, path, code, add) { Object.keys(value).forEach((key) => { if (!keys.includes(key)) add(code, `${path}.${key}`); }); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function requiredString(value, path, code, add) { if (typeof value !== "string" || value.trim() === "") add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add @param {readonly string[]=} allowedValues */
function stringArray(value, path, code, add, allowedValues) { if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.trim() === "" || (allowedValues && !allowedValues.includes(item)))) add(code, path); }
/** @param {unknown} value @param {number} min @param {number} max @param {boolean} includeMin */
function numberInRange(value, min, max, includeMin) { return typeof value === "number" && Number.isFinite(value) && (includeMin ? value >= min : value > min) && value <= max; }
/** @param {unknown} value */
function nonNegativeInteger(value) { return Number.isInteger(value) && /** @type {number} */ (value) >= 0; }
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
/** @template T @param {T} value @returns {T} */
function clone(value) { return JSON.parse(JSON.stringify(value)); }

export class AnalysisRuleSetError extends Error {
  /** @param {string} code @param {AnalysisRuleValidationError[]} errors */
  constructor(code, errors = []) { super(code); this.name = "AnalysisRuleSetError"; this.code = code; this.errors = errors; }
}
