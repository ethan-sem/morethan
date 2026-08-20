import { APPLICATION_TIER_PLAN_VERSION, validateApplicationTierPlan } from "./applicationTierPlan.js";
import { CAREER_PROFILE_ANALYSIS_VERSION } from "./careerProfileAnalysis.js";
import { validateJdGapAnalysis } from "./jdGapAnalysis.js";
import { findEvidenceDegradation, validateEvidenceDegradationPlan } from "./evidenceDegradation.js";

export const ACTION_PLAN_VERSION = "1.0.0";
export const ACTION_WINDOWS = Object.freeze(["48_hours", "7_days", "30_days"]);

/** @typedef {typeof ACTION_WINDOWS[number]} ActionWindow */
/** @typedef {{ type: "career_rule" | "jd_item" | "tier_lane", id: string }} ActionTrigger */
/** @typedef {{ id: string, window: ActionWindow, priority: number, triggerRule: string, triggers: ActionTrigger[], title: string, why: string, steps: string[], deliverable: string, doneCriteria: string[], estimatedMinutes: number, evidenceFactIds: string[] }} ActionItem */
/** @typedef {{ schemaVersion: string, documentId: string, careerAnalysisVersion: string, jdGapAnalysisVersion: string | null, tierPlanVersion: string, items: ActionItem[], summary: { total: number, totalEstimatedMinutes: number, byWindow: { "48_hours": number, "7_days": number, "30_days": number } }, disclaimer: string }} ActionPlan */
/** @typedef {{ code: string, path: string }} ActionPlanValidationError */

export class ActionPlanError extends Error {
  /** @param {string} code @param {unknown[]} details */
  constructor(code, details = []) { super(code); this.name = "ActionPlanError"; this.code = code; this.details = details; }
}

/**
 * Generates at most five concrete actions from current evidence gaps and application conditions.
 * @param {ReturnType<import("./careerProfileAnalysis.js").analyzeCareerProfile>} careerAnalysis
 * @param {import("./jdGapAnalysis.js").JdGapAnalysis | null} jdGapAnalysis
 * @param {import("./applicationTierPlan.js").ApplicationTierPlan} tierPlan
 * @param {{ degradationPlan?: import("./evidenceDegradation.js").EvidenceDegradationPlan | null }=} options
 * @returns {ActionPlan}
 */
export function createActionPlan(careerAnalysis, jdGapAnalysis, tierPlan, options = {}) {
  if (!careerAnalysis || careerAnalysis.schemaVersion !== CAREER_PROFILE_ANALYSIS_VERSION) throw new ActionPlanError("CAREER_ANALYSIS_INVALID");
  const tierValidation = validateApplicationTierPlan(tierPlan);
  if (!tierValidation.valid) throw new ActionPlanError("TIER_PLAN_INVALID", tierValidation.errors);
  if (tierPlan.careerAnalysisVersion !== careerAnalysis.schemaVersion) throw new ActionPlanError("ANALYSIS_VERSION_MISMATCH");
  if (jdGapAnalysis) {
    const gapValidation = validateJdGapAnalysis(jdGapAnalysis);
    if (!gapValidation.valid) throw new ActionPlanError("JD_GAP_ANALYSIS_INVALID", gapValidation.errors);
    if (jdGapAnalysis.documentId !== careerAnalysis.documentId) throw new ActionPlanError("ANALYSIS_DOCUMENT_MISMATCH");
  }
  const degradationPlan = options.degradationPlan ?? null;
  if (degradationPlan) {
    const degradationValidation = validateEvidenceDegradationPlan(degradationPlan);
    if (!degradationValidation.valid) throw new ActionPlanError("DEGRADATION_PLAN_INVALID", degradationValidation.errors);
    if (degradationPlan.documentId !== careerAnalysis.documentId || degradationPlan.careerAnalysisVersion !== careerAnalysis.schemaVersion) throw new ActionPlanError("DEGRADATION_PLAN_MISMATCH");
  }

  const factIds = [...careerAnalysis.factsConsideredIds];
  const jdPriorities = jdGapAnalysis?.items.filter((item) => item.status !== "covered").sort((left, right) => {
    const typeOrder = { required: 0, responsibility: 1, preferred: 2 };
    return typeOrder[left.jdItemType] - typeOrder[right.jdItemType] || left.score - right.score || left.sourceLine - right.sourceLine;
  }) ?? [];
  const careerGap = [...careerAnalysis.gaps, ...careerAnalysis.insufficient].find((item) => findEvidenceDegradation(degradationPlan, item.id)?.outcome !== "omitted") ?? null;
  const mainLane = tierPlan.lanes.find((lane) => lane.id === "main");
  const exploreLane = tierPlan.lanes.find((lane) => lane.id === "explore");
  const primaryJdGap = jdPriorities[0] ?? null;
  const secondaryJdGap = jdPriorities[1] ?? null;

  /** @type {ActionItem[]} */
  const items = [];
  if (primaryJdGap) items.push(actionFromJdGap(primaryJdGap, 1, "48_hours"));
  else if (careerGap) items.push(actionFromCareerGap(careerGap, 1, "48_hours"));
  else items.push(verifyEvidenceAction(careerAnalysis, 1));

  if (secondaryJdGap) items.push(actionFromJdGap(secondaryJdGap, 2, "48_hours"));
  else if (!jdGapAnalysis) items.push(collectJdAction(careerAnalysis, 2));
  else if (careerGap && !items.some((item) => item.triggers.some((trigger) => trigger.id === careerGap.id))) items.push(actionFromCareerGap(careerGap, 2, "48_hours"));

  items.push(buildEvidenceMatrixAction(jdGapAnalysis, mainLane, items.length + 1, factIds));
  items.push(buildApplicationBatchAction(mainLane, exploreLane, items.length + 1));
  items.push(reviewFeedbackAction(tierPlan, items.length + 1));

  const limited = items.slice(0, 5).map((item, index) => ({ ...item, id: `action-${String(index + 1).padStart(3, "0")}`, priority: index + 1 }));
  const byWindow = {
    "48_hours": limited.filter((item) => item.window === "48_hours").length,
    "7_days": limited.filter((item) => item.window === "7_days").length,
    "30_days": limited.filter((item) => item.window === "30_days").length,
  };
  const result = {
    schemaVersion: ACTION_PLAN_VERSION,
    documentId: careerAnalysis.documentId,
    careerAnalysisVersion: careerAnalysis.schemaVersion,
    jdGapAnalysisVersion: jdGapAnalysis?.schemaVersion ?? null,
    tierPlanVersion: tierPlan.schemaVersion,
    items: limited,
    summary: { total: limited.length, totalEstimatedMinutes: limited.reduce((sum, item) => sum + item.estimatedMinutes, 0), byWindow },
    disclaimer: "行动计划只基于当前已确认事实和岗位样本；不得虚构经历或数据，完成任务也不代表获得面试或 offer。",
  };
  const validation = validateActionPlan(result);
  if (!validation.valid) throw new ActionPlanError("ACTION_PLAN_INVALID", validation.errors);
  return result;
}

/** @param {unknown} value @returns {{ valid: boolean, errors: ActionPlanValidationError[] }} */
export function validateActionPlan(value) {
  /** @type {ActionPlanValidationError[]} */
  const errors = [];
  /** @param {string} code @param {string} path */
  const add = (code, path) => errors.push({ code, path });
  if (!isRecord(value)) return { valid: false, errors: [{ code: "ROOT_INVALID", path: "$" }] };
  allowed(value, ["schemaVersion", "documentId", "careerAnalysisVersion", "jdGapAnalysisVersion", "tierPlanVersion", "items", "summary", "disclaimer"], "$", "ROOT_KEY_UNKNOWN", add);
  if (value.schemaVersion !== ACTION_PLAN_VERSION) add("SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion");
  requiredString(value.documentId, "$.documentId", "DOCUMENT_ID_INVALID", add);
  if (value.careerAnalysisVersion !== CAREER_PROFILE_ANALYSIS_VERSION) add("CAREER_ANALYSIS_VERSION_UNSUPPORTED", "$.careerAnalysisVersion");
  if (value.jdGapAnalysisVersion !== null && typeof value.jdGapAnalysisVersion !== "string") add("JD_GAP_VERSION_INVALID", "$.jdGapAnalysisVersion");
  if (value.tierPlanVersion !== APPLICATION_TIER_PLAN_VERSION) add("TIER_PLAN_VERSION_UNSUPPORTED", "$.tierPlanVersion");
  validateItems(value.items, add);
  validateSummary(value.summary, value.items, add);
  requiredString(value.disclaimer, "$.disclaimer", "DISCLAIMER_INVALID", add);
  return { valid: errors.length === 0, errors };
}

/** @param {import("./jdGapAnalysis.js").JdGapItem} gap @param {number} priority @param {ActionWindow} window @returns {ActionItem} */
function actionFromJdGap(gap, priority, window) {
  const typeLabel = gap.jdItemType === "required" ? "硬要求" : gap.jdItemType === "responsibility" ? "岗位职责" : "加分项";
  const factIds = gap.factRefs.map((ref) => ref.factId);
  return {
    id: "pending", window, priority, triggerRule: `jd_gap:${gap.status}`,
    triggers: [{ type: "jd_item", id: gap.jdItemId }],
    title: `${gap.status === "partial" ? "补强" : "核实"}${typeLabel}：“${truncate(gap.jdText, 26)}”`,
    why: gap.interpretation,
    steps: gap.status === "partial" ? ["找到命中关键词对应的真实经历", "补充使用场景、个人动作和结果", "删除无法被真实案例支持的强表述"] : ["确认自己是否确实有相关经历", "有则整理一条真实案例，无则记录为选岗或准备重点", "根据结论调整简历或岗位选择"],
    deliverable: gap.status === "partial" ? "一条包含场景、动作和结果的简历证据" : "一条真实证据，或一项明确的岗位筛选/准备决定",
    doneCriteria: ["内容可以被面试追问", "没有虚构动作、结果或数据", `已回应 JD 第 ${gap.sourceLine} 行`],
    estimatedMinutes: gap.status === "partial" ? 60 : 45,
    evidenceFactIds: factIds,
  };
}

/** @param {import("./careerProfileAnalysis.js").ProfileConclusion} gap @param {number} priority @param {ActionWindow} window @returns {ActionItem} */
function actionFromCareerGap(gap, priority, window) {
  /** @type {Record<string, string>} */
  const titleByMetric = { action_clarity: "补清一段经历中的个人动作", method_depth: "补充方法与决策过程", result_evidence: "补齐一条真实结果证据", impact_scale: "核实并补充影响规模", ownership: "区分个人贡献与团队成果", role_relevance: "建立经历与目标岗位的任务映射", credibility: "补充可追问的事实细节" };
  return {
    id: "pending", window, priority, triggerRule: gap.ruleId,
    triggers: [{ type: "career_rule", id: gap.id }],
    title: titleByMetric[gap.metric] ?? "补齐最影响判断的一条证据",
    why: gap.claim,
    steps: ["选择一段最相关的已确认经历", "只使用能够核实的动作、方法、结果或规模", "重写为一条可被面试追问的简历描述"],
    deliverable: "一条更新后的真实经历描述",
    doneCriteria: ["能区分个人动作与团队成果", "至少包含动作、方法或结果中的两项", "没有新增无法核实的数据"],
    estimatedMinutes: 60,
    evidenceFactIds: [...gap.factIds],
  };
}

/** @param {ReturnType<import("./careerProfileAnalysis.js").analyzeCareerProfile>} analysis @param {number} priority @returns {ActionItem} */
function verifyEvidenceAction(analysis, priority) {
  return { id: "pending", window: "48_hours", priority, triggerRule: "career_evidence_verify", triggers: analysis.strengths.slice(0, 1).map((item) => ({ type: /** @type {const} */ ("career_rule"), id: item.id })), title: "核对最强证据的可追问细节", why: "当前没有明显证据缺口，下一步应先确认最强表述真实、具体且稳定。", steps: ["选出报告中的最强证据", "写下背景、个人动作、结果和可核实细节", "删除无法解释的数据或归因"], deliverable: "一张最强经历追问卡", doneCriteria: ["可在 2 分钟内讲清", "所有数据都有真实来源", "能说明个人贡献"], estimatedMinutes: 45, evidenceFactIds: [...analysis.factsConsideredIds] };
}

/** @param {ReturnType<import("./careerProfileAnalysis.js").analyzeCareerProfile>} analysis @param {number} priority @returns {ActionItem} */
function collectJdAction(analysis, priority) {
  const label = analysis.direction.selectedLabel ?? "目标方向";
  return { id: "pending", window: "48_hours", priority, triggerRule: "jd_missing", triggers: [], title: `收集 3–5 份${label}真实 JD`, why: "当前没有目标 JD，方向画像只能使用通用岗位族规则，无法核实具体硬要求。", steps: ["从公司招聘官网或可信招聘页面收集同类 JD", "标出重复出现的职责、硬要求和加分项", "选择一份最想投的 JD 回到本工具分析"], deliverable: "3–5 份带来源的同类 JD 和一份共性要求清单", doneCriteria: ["每份 JD 记录公司、岗位、地点和来源", "至少提取 5 项重复要求", "不把过期信息当作确定在招"], estimatedMinutes: 60, evidenceFactIds: [] };
}

/** @param {import("./jdGapAnalysis.js").JdGapAnalysis | null} gap @param {import("./applicationTierPlan.js").ApplicationTierLane | undefined} mainLane @param {number} priority @param {string[]} factIds @returns {ActionItem} */
function buildEvidenceMatrixAction(gap, mainLane, priority, factIds) {
  return { id: "pending", window: "7_days", priority, triggerRule: gap ? "jd_evidence_matrix" : "role_evidence_matrix", triggers: mainLane ? [{ type: "tier_lane", id: mainLane.id }] : [], title: "完成一份岗位要求—简历证据对照表", why: gap ? `当前 JD 有 ${gap.summary.partial} 项证据较弱、${gap.summary.notFound} 项未找到证据。` : "缺少具体 JD 时，需要先把目标方向的共性要求与现有证据对应起来。", steps: ["列出 5–8 项核心岗位要求", "为每项填写直接证据、较弱证据或未找到", "给未找到项标注补材料、准备或放弃该岗位"], deliverable: "一份不超过 8 行的岗位证据对照表", doneCriteria: ["每项要求都有证据状态", "直接证据能回到真实经历", "未找到项有明确处理决定"], estimatedMinutes: 75, evidenceFactIds: factIds };
}

/** @param {import("./applicationTierPlan.js").ApplicationTierLane | undefined} main @param {import("./applicationTierPlan.js").ApplicationTierLane | undefined} explore @param {number} priority @returns {ActionItem} */
function buildApplicationBatchAction(main, explore, priority) {
  return { id: "pending", window: "7_days", priority, triggerRule: "tier_application_batch", triggers: [main, explore].filter(Boolean).map((lane) => ({ type: /** @type {const} */ ("tier_lane"), id: /** @type {import("./applicationTierPlan.js").ApplicationTierLane} */ (lane).id })), title: "建立首批 10 个岗位的投递组合", why: "需要把四层占比转成有限、可复盘的真实岗位样本，而不是无目标海投。", steps: ["按四层占比挑选 10 个具体岗位", "记录公司、岗位、地点、来源和截止日期", "逐个核实硬要求与招聘状态后再投递"], deliverable: "一张包含 10 个候选岗位的投递清单", doneCriteria: ["每个岗位有来源和核验日期", `主申方向围绕“${main?.targetLabel ?? "当前主方向"}”`, `探索岗位不超过建议占比，优先“${explore?.targetLabel ?? "相邻方向"}”`], estimatedMinutes: 90, evidenceFactIds: [...(main?.evidenceFactIds ?? [])] };
}

/** @param {import("./applicationTierPlan.js").ApplicationTierPlan} tierPlan @param {number} priority @returns {ActionItem} */
function reviewFeedbackAction(tierPlan, priority) {
  return { id: "pending", window: "30_days", priority, triggerRule: "application_feedback_review", triggers: tierPlan.lanes.map((lane) => ({ type: /** @type {const} */ ("tier_lane"), id: lane.id })), title: "用真实反馈复盘并调整四层占比", why: "当前四层来自简历和岗位规则，必须用投递、笔试和面试反馈继续校准。", steps: ["汇总投递数、回复、笔试和面试问题", "按方向和层级比较反馈，不把无回复直接解释为能力不足", "调整下一批岗位占比并记录原因"], deliverable: "一页 30 天反馈复盘和下一批投递比例", doneCriteria: ["记录至少一轮真实反馈；若无反馈则记录渠道与样本量", "调整有数据或明确观察依据", "不把稳妥层解释为 offer 保证"], estimatedMinutes: 60, evidenceFactIds: [...tierPlan.lanes.flatMap((lane) => lane.evidenceFactIds)] };
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateItems(value, add) {
  if (!Array.isArray(value) || value.length < 3 || value.length > 5) { add("ITEMS_COUNT_INVALID", "$.items"); return; }
  const ids = new Set();
  value.forEach((item, index) => {
    const path = `$.items[${index}]`;
    if (!isRecord(item)) { add("ITEM_INVALID", path); return; }
    allowed(item, ["id", "window", "priority", "triggerRule", "triggers", "title", "why", "steps", "deliverable", "doneCriteria", "estimatedMinutes", "evidenceFactIds"], path, "ITEM_KEY_UNKNOWN", add);
    requiredString(item.id, `${path}.id`, "ITEM_ID_INVALID", add);
    if (typeof item.id === "string" && ids.has(item.id)) add("ITEM_ID_DUPLICATE", `${path}.id`); else if (typeof item.id === "string") ids.add(item.id);
    if (!ACTION_WINDOWS.includes(/** @type {ActionWindow} */ (item.window))) add("ITEM_WINDOW_INVALID", `${path}.window`);
    if (!Number.isInteger(item.priority) || item.priority !== index + 1) add("ITEM_PRIORITY_INVALID", `${path}.priority`);
    requiredString(item.triggerRule, `${path}.triggerRule`, "ITEM_TRIGGER_RULE_INVALID", add);
    validateTriggers(item.triggers, path, add);
    for (const key of ["title", "why", "deliverable"]) requiredString(item[key], `${path}.${key}`, `ITEM_${key.toUpperCase()}_INVALID`, add);
    stringArray(item.steps, `${path}.steps`, "ITEM_STEPS_INVALID", add, false);
    stringArray(item.doneCriteria, `${path}.doneCriteria`, "ITEM_DONE_CRITERIA_INVALID", add, false);
    if (!Number.isInteger(item.estimatedMinutes) || /** @type {number} */ (item.estimatedMinutes) < 15 || /** @type {number} */ (item.estimatedMinutes) > 240) add("ITEM_ESTIMATE_INVALID", `${path}.estimatedMinutes`);
    stringArray(item.evidenceFactIds, `${path}.evidenceFactIds`, "ITEM_FACT_IDS_INVALID", add, true);
  });
  ACTION_WINDOWS.forEach((window) => { if (!value.some((item) => isRecord(item) && item.window === window)) add("WINDOW_MISSING", "$.items"); });
}

/** @param {unknown} value @param {string} parent @param {(code: string, path: string) => void} add */
function validateTriggers(value, parent, add) {
  const path = `${parent}.triggers`;
  if (!Array.isArray(value)) { add("TRIGGERS_INVALID", path); return; }
  value.forEach((trigger, index) => {
    const triggerPath = `${path}[${index}]`;
    if (!isRecord(trigger)) { add("TRIGGER_INVALID", triggerPath); return; }
    allowed(trigger, ["type", "id"], triggerPath, "TRIGGER_KEY_UNKNOWN", add);
    if (!["career_rule", "jd_item", "tier_lane"].includes(/** @type {string} */ (trigger.type))) add("TRIGGER_TYPE_INVALID", `${triggerPath}.type`);
    requiredString(trigger.id, `${triggerPath}.id`, "TRIGGER_ID_INVALID", add);
  });
}

/** @param {unknown} value @param {unknown} items @param {(code: string, path: string) => void} add */
function validateSummary(value, items, add) {
  if (!isRecord(value)) { add("SUMMARY_INVALID", "$.summary"); return; }
  allowed(value, ["total", "totalEstimatedMinutes", "byWindow"], "$.summary", "SUMMARY_KEY_UNKNOWN", add);
  if (!Number.isInteger(value.total) || !Array.isArray(items) || value.total !== items.length) add("SUMMARY_TOTAL_INVALID", "$.summary.total");
  if (!Number.isInteger(value.totalEstimatedMinutes) || /** @type {number} */ (value.totalEstimatedMinutes) < 0) add("SUMMARY_MINUTES_INVALID", "$.summary.totalEstimatedMinutes");
  if (Array.isArray(items) && items.every(isRecord)) {
    const expectedMinutes = items.reduce((sum, item) => sum + (Number.isInteger(item.estimatedMinutes) ? /** @type {number} */ (item.estimatedMinutes) : 0), 0);
    if (value.totalEstimatedMinutes !== expectedMinutes) add("SUMMARY_MINUTES_MISMATCH", "$.summary.totalEstimatedMinutes");
  }
  if (!isRecord(value.byWindow)) add("SUMMARY_WINDOWS_INVALID", "$.summary.byWindow");
  else {
    const byWindow = value.byWindow;
    allowed(byWindow, ACTION_WINDOWS, "$.summary.byWindow", "SUMMARY_WINDOWS_KEY_UNKNOWN", add);
    ACTION_WINDOWS.forEach((window) => {
      const expected = Array.isArray(items) ? items.filter((item) => isRecord(item) && item.window === window).length : 0;
      if (!Number.isInteger(byWindow[window]) || /** @type {number} */ (byWindow[window]) < 1 || byWindow[window] !== expected) add("SUMMARY_WINDOW_VALUE_INVALID", `$.summary.byWindow.${window}`);
    });
  }
}

/** @param {string} value @param {number} length */
function truncate(value, length) { return value.length > length ? `${value.slice(0, length)}…` : value; }
/** @param {Record<string, unknown>} value @param {readonly string[]} keys @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function allowed(value, keys, path, code, add) { Object.keys(value).forEach((key) => { if (!keys.includes(key)) add(code, `${path}.${key}`); }); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function requiredString(value, path, code, add) { if (typeof value !== "string" || !value.trim()) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add @param {boolean} allowEmpty */
function stringArray(value, path, code, add, allowEmpty) { if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((entry) => typeof entry !== "string" || !entry.trim())) add(code, path); }
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
