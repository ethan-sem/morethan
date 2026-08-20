import { createDefaultAnalysisRuleSet } from "./analysisRules.js";
import { CAREER_PROFILE_ANALYSIS_VERSION } from "./careerProfileAnalysis.js";

export const EVIDENCE_DEGRADATION_VERSION = "1.0.0";
export const DEGRADATION_ANSWERS = Object.freeze(["has_evidence", "not_available", "unsure"]);
export const DEGRADATION_OUTCOMES = Object.freeze(["pending_question", "needs_fact_update", "conditional_advice", "omitted"]);

/** @typedef {typeof DEGRADATION_ANSWERS[number]} DegradationAnswer */
/** @typedef {typeof DEGRADATION_OUTCOMES[number]} DegradationOutcome */
/** @typedef {{ id: string, conclusionId: string, ruleId: string, metric: string, configuredAction: import("./analysisRules.js").AnalysisDegradationAction, reason: "missing_required_evidence" | "insufficient_evidence", missingEvidenceCodes: string[], factIds: string[], question: string | null, answer: DegradationAnswer | null, outcome: DegradationOutcome, displayTitle: string, displayText: string }} EvidenceDegradationItem */
/** @typedef {{ schemaVersion: string, documentId: string, careerAnalysisVersion: string, ruleSetVersion: string, items: EvidenceDegradationItem[], summary: { total: number, pendingQuestion: number, needsFactUpdate: number, conditionalAdvice: number, omitted: number }, disclaimer: string }} EvidenceDegradationPlan */
/** @typedef {{ code: string, path: string }} EvidenceDegradationValidationError */

export class EvidenceDegradationError extends Error {
  /** @param {string} code @param {unknown[]} details */
  constructor(code, details = []) { super(code); this.name = "EvidenceDegradationError"; this.code = code; this.details = details; }
}

/**
 * Converts weak profile conclusions into explicit questions, conditional advice, or omission.
 * Answers never create or confirm resume facts.
 * @param {ReturnType<import("./careerProfileAnalysis.js").analyzeCareerProfile>} careerAnalysis
 * @param {{ ruleSet?: import("./analysisRules.js").AnalysisRuleSet }} options
 * @returns {EvidenceDegradationPlan}
 */
export function createEvidenceDegradationPlan(careerAnalysis, options = {}) {
  if (!careerAnalysis || careerAnalysis.schemaVersion !== CAREER_PROFILE_ANALYSIS_VERSION) throw new EvidenceDegradationError("CAREER_ANALYSIS_INVALID");
  const ruleSet = options.ruleSet ?? createDefaultAnalysisRuleSet();
  if (ruleSet.ruleSetVersion !== careerAnalysis.ruleSetVersion) throw new EvidenceDegradationError("RULESET_VERSION_MISMATCH");
  const rules = new Map(ruleSet.rules.map((rule) => [rule.id, rule]));
  const evidenceCodes = new Set(careerAnalysis.evidence.map((item) => item.code));
  const candidates = [...careerAnalysis.gaps, ...careerAnalysis.insufficient].slice(0, careerAnalysis.limits.gaps);
  const items = candidates.map((conclusion, index) => {
    const rule = rules.get(conclusion.ruleId);
    if (!rule) throw new EvidenceDegradationError("RULE_NOT_FOUND", [conclusion.ruleId]);
    const missingEvidenceCodes = rule.evidence.required.filter((code) => !evidenceCodes.has(code));
    const reason = conclusion.type === "insufficient" ? /** @type {const} */ ("insufficient_evidence") : /** @type {const} */ ("missing_required_evidence");
    const configuredAction = reason === "insufficient_evidence" ? rule.degradation.onInsufficientEvidence : rule.degradation.onMissingRequiredEvidence;
    return buildItem(index, conclusion, rule, configuredAction, reason, missingEvidenceCodes, null);
  });
  return finalize(careerAnalysis.documentId, careerAnalysis.ruleSetVersion, items);
}

/** @param {EvidenceDegradationPlan} plan @param {string} itemId @param {DegradationAnswer | null} answer */
export function answerEvidenceDegradation(plan, itemId, answer) {
  const validation = validateEvidenceDegradationPlan(plan);
  if (!validation.valid) throw new EvidenceDegradationError("PLAN_INVALID", validation.errors);
  if (answer !== null && !DEGRADATION_ANSWERS.includes(answer)) throw new EvidenceDegradationError("ANSWER_INVALID");
  let found = false;
  const items = plan.items.map((item, index) => {
    if (item.id !== itemId) return item;
    found = true;
    if (item.configuredAction !== "ask_user") throw new EvidenceDegradationError("ITEM_NOT_ANSWERABLE");
    return resolveAnsweredItem(item, index, answer);
  });
  if (!found) throw new EvidenceDegradationError("ITEM_NOT_FOUND");
  return finalize(plan.documentId, plan.ruleSetVersion, items);
}

/** @param {EvidenceDegradationPlan | null} plan @param {string} conclusionId */
export function findEvidenceDegradation(plan, conclusionId) {
  return plan?.items.find((item) => item.conclusionId === conclusionId) ?? null;
}

/** @param {unknown} value @returns {{ valid: boolean, errors: EvidenceDegradationValidationError[] }} */
export function validateEvidenceDegradationPlan(value) {
  /** @type {EvidenceDegradationValidationError[]} */
  const errors = [];
  /** @param {string} code @param {string} path */
  const add = (code, path) => errors.push({ code, path });
  if (!isRecord(value)) return { valid: false, errors: [{ code: "ROOT_INVALID", path: "$" }] };
  allowed(value, ["schemaVersion", "documentId", "careerAnalysisVersion", "ruleSetVersion", "items", "summary", "disclaimer"], "$", "ROOT_KEY_UNKNOWN", add);
  if (value.schemaVersion !== EVIDENCE_DEGRADATION_VERSION) add("SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion");
  requiredString(value.documentId, "$.documentId", "DOCUMENT_ID_INVALID", add);
  if (value.careerAnalysisVersion !== CAREER_PROFILE_ANALYSIS_VERSION) add("CAREER_ANALYSIS_VERSION_UNSUPPORTED", "$.careerAnalysisVersion");
  requiredString(value.ruleSetVersion, "$.ruleSetVersion", "RULESET_VERSION_INVALID", add);
  validateItems(value.items, add);
  validateSummary(value.summary, value.items, add);
  requiredString(value.disclaimer, "$.disclaimer", "DISCLAIMER_INVALID", add);
  return { valid: errors.length === 0, errors };
}

/** @param {number} index @param {import("./careerProfileAnalysis.js").ProfileConclusion} conclusion @param {import("./analysisRules.js").AnalysisRule} rule @param {import("./analysisRules.js").AnalysisDegradationAction} configuredAction @param {"missing_required_evidence" | "insufficient_evidence"} reason @param {string[]} missingEvidenceCodes @param {DegradationAnswer | null} answer @returns {EvidenceDegradationItem} */
function buildItem(index, conclusion, rule, configuredAction, reason, missingEvidenceCodes, answer) {
  const base = { id: `degradation-${String(index + 1).padStart(3, "0")}`, conclusionId: conclusion.id, ruleId: conclusion.ruleId, metric: conclusion.metric, configuredAction, reason, missingEvidenceCodes, factIds: [...conclusion.factIds] };
  if (configuredAction === "ask_user") return resolveAnsweredItem({ ...base, question: questionForMetric(conclusion.metric), answer: null, outcome: "pending_question", displayTitle: `需要补充：${rule.label}`, displayText: "回答前不会把该项写成肯定结论。" }, index, answer);
  if (configuredAction === "omit_conclusion") return { ...base, question: null, answer: null, outcome: "omitted", displayTitle: `已省略：${rule.label}`, displayText: "当前证据不足，本次报告不输出该项判断。" };
  return { ...base, question: null, answer: null, outcome: "conditional_advice", displayTitle: `条件式建议：${rule.label}`, displayText: conditionalText(conclusion.metric) };
}

/** @param {EvidenceDegradationItem} item @param {number} index @param {DegradationAnswer | null} answer @returns {EvidenceDegradationItem} */
function resolveAnsweredItem(item, index, answer) {
  const id = item.id || `degradation-${String(index + 1).padStart(3, "0")}`;
  if (answer === "has_evidence") return { ...item, id, answer, outcome: "needs_fact_update", displayTitle: "有相关经历，先补入已确认事实", displayText: "返回事实确认页补充真实场景、个人动作或结果；完成确认前，本次仍不把它作为正向证据。" };
  if (answer === "not_available") return { ...item, id, answer, outcome: "conditional_advice", displayTitle: "当前暂无直接证据，按条件选择", displayText: conditionalText(item.metric) };
  if (answer === "unsure") return { ...item, id, answer, outcome: "omitted", displayTitle: "无法确认，本次省略判断", displayText: "当前无法核实，本次报告不对该项能力作肯定或否定判断。" };
  return { ...item, id, answer: null, outcome: "pending_question", displayTitle: item.displayTitle, displayText: "回答前不会把该项写成肯定结论。" };
}

/** @param {string} documentId @param {string} ruleSetVersion @param {EvidenceDegradationItem[]} items @returns {EvidenceDegradationPlan} */
function finalize(documentId, ruleSetVersion, items) {
  const result = {
    schemaVersion: EVIDENCE_DEGRADATION_VERSION,
    documentId,
    careerAnalysisVersion: CAREER_PROFILE_ANALYSIS_VERSION,
    ruleSetVersion,
    items,
    summary: {
      total: items.length,
      pendingQuestion: items.filter((item) => item.outcome === "pending_question").length,
      needsFactUpdate: items.filter((item) => item.outcome === "needs_fact_update").length,
      conditionalAdvice: items.filter((item) => item.outcome === "conditional_advice").length,
      omitted: items.filter((item) => item.outcome === "omitted").length,
    },
    disclaimer: "追问回答只用于选择降级方式，不会自动写入或确认简历事实；证据不足时不输出肯定能力结论。",
  };
  const validation = validateEvidenceDegradationPlan(result);
  if (!validation.valid) throw new EvidenceDegradationError("PLAN_INVALID", validation.errors);
  return result;
}

/** @param {string} metric */
function questionForMetric(metric) {
  /** @type {Record<string, string>} */
  const questions = {
    action_clarity: "你是否有一段能明确说明自己亲自做了什么的真实经历？",
    method_depth: "你是否能说明完成任务时实际使用的方法、工具或决策过程？",
    result_evidence: "你是否有能够核实的产出、变化或结果信息？",
    impact_scale: "你是否知道该经历真实影响的用户、时间、金额、团队或数据规模？",
    ownership: "你是否能区分自己负责的部分与团队整体成果？",
    role_relevance: "你是否有尚未写入简历、但与目标岗位任务直接相关的经历？",
    credibility: "你是否能补充可被面试追问和核实的具体细节？",
  };
  return questions[metric] ?? "你是否有能够补充并核实的相关事实？";
}

/** @param {string} metric */
function conditionalText(metric) {
  /** @type {Record<string, string>} */
  const text = {
    action_clarity: "只投递允许在后续材料中补充个人动作的岗位，并避免使用“负责全部”等强归因表述。",
    method_depth: "优先选择不把特定方法作为硬门槛的岗位；若实际使用过，先补充真实使用场景再表述熟练度。",
    result_evidence: "可以先使用真实产出描述，但不要虚构增长、转化或规模数据；结果导向岗位需谨慎扩大投递。",
    impact_scale: "无法核实规模时使用定性结果，并明确范围未知，不补造人数、金额或百分比。",
    ownership: "团队项目只描述自己能够核实的职责和动作，不把团队成果全部归因于个人。",
    role_relevance: "先以少量岗位验证方向；在获得真实 JD 和反馈前，不把当前方向写成确定性最优选择。",
    credibility: "删减无法解释或无法追问的强表述，保留能够说明来源和过程的事实。",
  };
  return text[metric] ?? "只在明确前提成立时采用该建议，并继续补充可核实事实。";
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateItems(value, add) {
  if (!Array.isArray(value) || value.length > 3) { add("ITEMS_INVALID", "$.items"); return; }
  const ids = new Set();
  const conclusions = new Set();
  value.forEach((item, index) => {
    const path = `$.items[${index}]`;
    if (!isRecord(item)) { add("ITEM_INVALID", path); return; }
    allowed(item, ["id", "conclusionId", "ruleId", "metric", "configuredAction", "reason", "missingEvidenceCodes", "factIds", "question", "answer", "outcome", "displayTitle", "displayText"], path, "ITEM_KEY_UNKNOWN", add);
    for (const key of ["id", "conclusionId", "ruleId", "metric", "displayTitle", "displayText"]) requiredString(item[key], `${path}.${key}`, "ITEM_TEXT_INVALID", add);
    if (typeof item.id === "string" && ids.has(item.id)) add("ITEM_ID_DUPLICATE", `${path}.id`); else if (typeof item.id === "string") ids.add(item.id);
    if (typeof item.conclusionId === "string" && conclusions.has(item.conclusionId)) add("CONCLUSION_DUPLICATE", `${path}.conclusionId`); else if (typeof item.conclusionId === "string") conclusions.add(item.conclusionId);
    if (!["ask_user", "conditional_advice", "omit_conclusion"].includes(item.configuredAction)) add("CONFIGURED_ACTION_INVALID", `${path}.configuredAction`);
    if (!["missing_required_evidence", "insufficient_evidence"].includes(item.reason)) add("REASON_INVALID", `${path}.reason`);
    stringArray(item.missingEvidenceCodes, `${path}.missingEvidenceCodes`, "MISSING_EVIDENCE_INVALID", add, true);
    stringArray(item.factIds, `${path}.factIds`, "FACT_IDS_INVALID", add, true);
    if (item.question !== null && (typeof item.question !== "string" || !item.question.trim())) add("QUESTION_INVALID", `${path}.question`);
    if (item.answer !== null && !DEGRADATION_ANSWERS.includes(item.answer)) add("ANSWER_INVALID", `${path}.answer`);
    if (!DEGRADATION_OUTCOMES.includes(item.outcome)) add("OUTCOME_INVALID", `${path}.outcome`);
    if (item.configuredAction === "ask_user" && item.question === null) add("QUESTION_REQUIRED", `${path}.question`);
    if (item.configuredAction !== "ask_user" && (item.question !== null || item.answer !== null)) add("QUESTION_NOT_ALLOWED", path);
    const expectedOutcome = item.configuredAction === "ask_user" ? item.answer === "has_evidence" ? "needs_fact_update" : item.answer === "not_available" ? "conditional_advice" : item.answer === "unsure" ? "omitted" : "pending_question" : item.configuredAction === "conditional_advice" ? "conditional_advice" : "omitted";
    if (item.outcome !== expectedOutcome) add("OUTCOME_MISMATCH", `${path}.outcome`);
  });
}

/** @param {unknown} value @param {unknown} items @param {(code: string, path: string) => void} add */
function validateSummary(value, items, add) {
  if (!isRecord(value)) { add("SUMMARY_INVALID", "$.summary"); return; }
  allowed(value, ["total", "pendingQuestion", "needsFactUpdate", "conditionalAdvice", "omitted"], "$.summary", "SUMMARY_KEY_UNKNOWN", add);
  const outcomes = ["pendingQuestion", "needsFactUpdate", "conditionalAdvice", "omitted"];
  /** @type {Record<string, string>} */
  const outcomeMap = { pendingQuestion: "pending_question", needsFactUpdate: "needs_fact_update", conditionalAdvice: "conditional_advice", omitted: "omitted" };
  if (!Number.isInteger(value.total) || !Array.isArray(items) || value.total !== items.length) add("SUMMARY_TOTAL_INVALID", "$.summary.total");
  outcomes.forEach((key) => { const expected = Array.isArray(items) ? items.filter((item) => isRecord(item) && item.outcome === outcomeMap[key]).length : 0; if (!Number.isInteger(value[key]) || value[key] !== expected) add("SUMMARY_VALUE_INVALID", `$.summary.${key}`); });
}

/** @param {Record<string, unknown>} value @param {readonly string[]} keys @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function allowed(value, keys, path, code, add) { Object.keys(value).forEach((key) => { if (!keys.includes(key)) add(code, `${path}.${key}`); }); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function requiredString(value, path, code, add) { if (typeof value !== "string" || !value.trim()) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add @param {boolean} allowEmpty */
function stringArray(value, path, code, add, allowEmpty) { if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || new Set(value).size !== value.length || value.some((entry) => typeof entry !== "string" || !entry.trim())) add(code, path); }
/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
