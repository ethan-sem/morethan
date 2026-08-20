import { CAREER_PROFILE_ANALYSIS_VERSION } from "./careerProfileAnalysis.js";
import { JD_GAP_ANALYSIS_VERSION, validateJdGapAnalysis } from "./jdGapAnalysis.js";

export const APPLICATION_TIER_PLAN_VERSION = "1.0.0";
export const APPLICATION_TIER_IDS = Object.freeze(["stretch", "main", "safe", "explore"]);

/** @typedef {typeof APPLICATION_TIER_IDS[number]} ApplicationTierId */
/** @typedef {{ id: ApplicationTierId, label: string, status: "active" | "conditional", targetRoleProfileId: string | null, targetLabel: string, allocationPercent: number, rationale: string, condition: string, evidenceFactIds: string[], caution: string }} ApplicationTierLane */
/** @typedef {{ schemaVersion: string, careerAnalysisVersion: string, jdGapAnalysisVersion: string | null, recruitmentType: "internship" | "campus", strategyBasis: "role_profile" | "role_profile_and_jd", selectedDirection: { id: string | null, label: string | null }, evidenceSummary: { confirmedFacts: number, strengths: number, gaps: number, jdCovered: number, jdPartial: number, jdNotFound: number, requiredNotFound: number }, lanes: ApplicationTierLane[], disclaimer: string }} ApplicationTierPlan */
/** @typedef {{ code: string, path: string }} ApplicationTierValidationError */

export class ApplicationTierPlanError extends Error {
  /** @param {string} code @param {unknown[]} details */
  constructor(code, details = []) { super(code); this.name = "ApplicationTierPlanError"; this.code = code; this.details = details; }
}

/**
 * Creates a provisional application mix. It does not classify companies; M5 will map verified company-role records into these lanes.
 * @param {ReturnType<import("./careerProfileAnalysis.js").analyzeCareerProfile>} careerAnalysis
 * @param {import("./jdGapAnalysis.js").JdGapAnalysis | null} jdGapAnalysis
 * @param {{ recruitmentType?: "internship" | "campus" }=} options
 * @returns {ApplicationTierPlan}
 */
export function createApplicationTierPlan(careerAnalysis, jdGapAnalysis = null, options = {}) {
  if (!careerAnalysis || careerAnalysis.schemaVersion !== CAREER_PROFILE_ANALYSIS_VERSION) throw new ApplicationTierPlanError("CAREER_ANALYSIS_INVALID");
  if (jdGapAnalysis) {
    const validation = validateJdGapAnalysis(jdGapAnalysis);
    if (!validation.valid) throw new ApplicationTierPlanError("JD_GAP_ANALYSIS_INVALID", validation.errors);
    if (jdGapAnalysis.documentId !== careerAnalysis.documentId) throw new ApplicationTierPlanError("ANALYSIS_DOCUMENT_MISMATCH");
  }
  const recruitmentType = options.recruitmentType ?? "internship";
  if (!new Set(["internship", "campus"]).has(recruitmentType)) throw new ApplicationTierPlanError("RECRUITMENT_TYPE_INVALID");

  const factIds = [...careerAnalysis.factsConsideredIds];
  const evidenceSummary = {
    confirmedFacts: factIds.length,
    strengths: careerAnalysis.strengths.length,
    gaps: careerAnalysis.gaps.length,
    jdCovered: jdGapAnalysis?.summary.covered ?? 0,
    jdPartial: jdGapAnalysis?.summary.partial ?? 0,
    jdNotFound: jdGapAnalysis?.summary.notFound ?? 0,
    requiredNotFound: jdGapAnalysis?.summary.requiredNotFound ?? 0,
  };
  const selected = { id: careerAnalysis.direction.selected, label: careerAnalysis.direction.selectedLabel };
  const adjacent = careerAnalysis.direction.matches.find((match) => match.id !== selected.id && match.score > 0) ?? null;
  const hasDirectionEvidence = careerAnalysis.direction.status === "matched" && evidenceSummary.strengths > 0;
  const jdTotal = jdGapAnalysis?.summary.total ?? 0;
  const jdCoverage = jdTotal ? (evidenceSummary.jdCovered + evidenceSummary.jdPartial * 0.5) / jdTotal : null;
  const safeSupported = jdCoverage !== null && jdCoverage >= 0.6 && evidenceSummary.requiredNotFound === 0;
  const allocations = factIds.length === 0 ? [0, 0, 0, 100] : hasDirectionEvidence && evidenceSummary.strengths >= 2 ? [20, 45, 20, 15] : [15, 35, 20, 30];
  const roleLabel = selected.label ?? "当前证据最相关的岗位方向";
  const exploreLabel = adjacent?.label ?? "相邻岗位方向";

  /** @type {ApplicationTierLane[]} */
  const lanes = [
    {
      id: "stretch", label: "冲刺", status: hasDirectionEvidence ? "active" : "conditional", targetRoleProfileId: selected.id, targetLabel: roleLabel, allocationPercent: allocations[0],
      rationale: hasDirectionEvidence ? `围绕${roleLabel}中竞争更强、但核心任务与已有证据相邻的岗位尝试。` : `当前对${roleLabel}的直接证据有限，冲刺投递只适合小规模验证。`,
      condition: evidenceSummary.requiredNotFound > 0 ? `投递前优先核实或补齐 ${evidenceSummary.requiredNotFound} 项未覆盖硬要求。` : "选择允许用项目证据证明潜力、且硬门槛已核实的岗位。",
      evidenceFactIds: factIds, caution: "冲刺表示竞争差距更明显，不代表该岗位更好，也不代表录取概率。",
    },
    {
      id: "main", label: "主申", status: hasDirectionEvidence ? "active" : "conditional", targetRoleProfileId: selected.id, targetLabel: roleLabel, allocationPercent: allocations[1],
      rationale: hasDirectionEvidence ? `${roleLabel}与当前已确认事实的任务或技能表达最接近，适合作为主要投递方向。` : "现有事实尚不足以稳定支持一个主方向，应先用反馈校准。",
      condition: jdGapAnalysis ? `优先选择直接覆盖较多、硬要求缺口较少的具体 JD；当前样本直接覆盖 ${evidenceSummary.jdCovered} 项。` : "没有目标 JD 时，先收集 3–5 份同类岗位描述再确认主申边界。",
      evidenceFactIds: factIds, caution: "主申只是证据相对更匹配，不是面试或 offer 保证。",
    },
    {
      id: "safe", label: "稳妥", status: safeSupported ? "active" : "conditional", targetRoleProfileId: selected.id, targetLabel: roleLabel, allocationPercent: allocations[2],
      rationale: safeSupported ? "当前 JD 样本的大部分要求已有直接或部分证据，且未发现未覆盖硬要求。" : "稳妥层必须逐个核对具体 JD；当前证据还不足以把任何岗位视为低风险。",
      condition: safeSupported ? "继续筛选核心职责相近、要求表述具体且来源已核验的岗位。" : "只把硬要求已核实、核心职责存在直接证据的具体岗位放入稳妥层。",
      evidenceFactIds: factIds, caution: "稳妥仅表示相对风险可控，固定不保证面试、录取或 offer。",
    },
    {
      id: "explore", label: "探索", status: "active", targetRoleProfileId: adjacent?.id ?? null, targetLabel: exploreLabel, allocationPercent: allocations[3],
      rationale: adjacent ? `${exploreLabel}与部分已确认关键词相邻，可用少量真实投递验证市场反馈。` : "当前没有足够证据确定相邻方向，探索层用于收集岗位要求和真实反馈。",
      condition: "控制投入比例，记录岗位要求、简历反馈和面试问题，再决定是否扩大。",
      evidenceFactIds: adjacent?.factIds ?? [], caution: "探索不是随意海投，也不应为了匹配岗位虚构经历。",
    },
  ];

  const result = {
    schemaVersion: APPLICATION_TIER_PLAN_VERSION,
    careerAnalysisVersion: careerAnalysis.schemaVersion,
    jdGapAnalysisVersion: jdGapAnalysis?.schemaVersion ?? null,
    recruitmentType,
    strategyBasis: jdGapAnalysis ? /** @type {const} */ ("role_profile_and_jd") : /** @type {const} */ ("role_profile"),
    selectedDirection: selected,
    evidenceSummary,
    lanes,
    disclaimer: "四层是本次投递组合策略，不是公司排名、永久定档或录取概率。报告中的公司目标池只提供官方入口，具体岗位仍需逐条核验。",
  };
  const validation = validateApplicationTierPlan(result);
  if (!validation.valid) throw new ApplicationTierPlanError("APPLICATION_TIER_PLAN_INVALID", validation.errors);
  return result;
}

/** @param {unknown} value @returns {{ valid: boolean, errors: ApplicationTierValidationError[] }} */
export function validateApplicationTierPlan(value) {
  /** @type {ApplicationTierValidationError[]} */
  const errors = [];
  /** @param {string} code @param {string} path */
  const add = (code, path) => errors.push({ code, path });
  if (!isRecord(value)) return { valid: false, errors: [{ code: "ROOT_INVALID", path: "$" }] };
  allowed(value, ["schemaVersion", "careerAnalysisVersion", "jdGapAnalysisVersion", "recruitmentType", "strategyBasis", "selectedDirection", "evidenceSummary", "lanes", "disclaimer"], "$", "ROOT_KEY_UNKNOWN", add);
  if (value.schemaVersion !== APPLICATION_TIER_PLAN_VERSION) add("SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion");
  if (value.careerAnalysisVersion !== CAREER_PROFILE_ANALYSIS_VERSION) add("CAREER_ANALYSIS_VERSION_UNSUPPORTED", "$.careerAnalysisVersion");
  if (value.jdGapAnalysisVersion !== null && value.jdGapAnalysisVersion !== JD_GAP_ANALYSIS_VERSION) add("JD_GAP_VERSION_UNSUPPORTED", "$.jdGapAnalysisVersion");
  if (!["internship", "campus"].includes(/** @type {string} */ (value.recruitmentType))) add("RECRUITMENT_TYPE_INVALID", "$.recruitmentType");
  if (!["role_profile", "role_profile_and_jd"].includes(/** @type {string} */ (value.strategyBasis))) add("STRATEGY_BASIS_INVALID", "$.strategyBasis");
  validateSelectedDirection(value.selectedDirection, add);
  validateEvidenceSummary(value.evidenceSummary, add);
  validateLanes(value.lanes, add);
  requiredString(value.disclaimer, "$.disclaimer", "DISCLAIMER_INVALID", add);
  return { valid: errors.length === 0, errors };
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateSelectedDirection(value, add) {
  if (!isRecord(value)) { add("SELECTED_DIRECTION_INVALID", "$.selectedDirection"); return; }
  allowed(value, ["id", "label"], "$.selectedDirection", "SELECTED_DIRECTION_KEY_UNKNOWN", add);
  if (value.id !== null && (typeof value.id !== "string" || !value.id)) add("SELECTED_DIRECTION_ID_INVALID", "$.selectedDirection.id");
  if (value.label !== null && (typeof value.label !== "string" || !value.label)) add("SELECTED_DIRECTION_LABEL_INVALID", "$.selectedDirection.label");
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateEvidenceSummary(value, add) {
  if (!isRecord(value)) { add("EVIDENCE_SUMMARY_INVALID", "$.evidenceSummary"); return; }
  const keys = ["confirmedFacts", "strengths", "gaps", "jdCovered", "jdPartial", "jdNotFound", "requiredNotFound"];
  allowed(value, keys, "$.evidenceSummary", "EVIDENCE_SUMMARY_KEY_UNKNOWN", add);
  keys.forEach((key) => { if (!Number.isInteger(value[key]) || /** @type {number} */ (value[key]) < 0) add("EVIDENCE_SUMMARY_VALUE_INVALID", `$.evidenceSummary.${key}`); });
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateLanes(value, add) {
  if (!Array.isArray(value) || value.length !== 4) { add("LANES_INVALID", "$.lanes"); return; }
  const seen = new Set();
  let allocation = 0;
  value.forEach((lane, index) => {
    const path = `$.lanes[${index}]`;
    if (!isRecord(lane)) { add("LANE_INVALID", path); return; }
    allowed(lane, ["id", "label", "status", "targetRoleProfileId", "targetLabel", "allocationPercent", "rationale", "condition", "evidenceFactIds", "caution"], path, "LANE_KEY_UNKNOWN", add);
    if (!APPLICATION_TIER_IDS.includes(/** @type {ApplicationTierId} */ (lane.id))) add("LANE_ID_INVALID", `${path}.id`);
    else if (seen.has(lane.id)) add("LANE_ID_DUPLICATE", `${path}.id`); else seen.add(lane.id);
    requiredString(lane.label, `${path}.label`, "LANE_LABEL_INVALID", add);
    if (!["active", "conditional"].includes(/** @type {string} */ (lane.status))) add("LANE_STATUS_INVALID", `${path}.status`);
    if (lane.targetRoleProfileId !== null && (typeof lane.targetRoleProfileId !== "string" || !lane.targetRoleProfileId)) add("LANE_ROLE_ID_INVALID", `${path}.targetRoleProfileId`);
    requiredString(lane.targetLabel, `${path}.targetLabel`, "LANE_TARGET_LABEL_INVALID", add);
    if (!Number.isInteger(lane.allocationPercent) || /** @type {number} */ (lane.allocationPercent) < 0 || /** @type {number} */ (lane.allocationPercent) > 100) add("LANE_ALLOCATION_INVALID", `${path}.allocationPercent`); else allocation += /** @type {number} */ (lane.allocationPercent);
    requiredString(lane.rationale, `${path}.rationale`, "LANE_RATIONALE_INVALID", add);
    requiredString(lane.condition, `${path}.condition`, "LANE_CONDITION_INVALID", add);
    stringArray(lane.evidenceFactIds, `${path}.evidenceFactIds`, "LANE_FACT_IDS_INVALID", add);
    requiredString(lane.caution, `${path}.caution`, "LANE_CAUTION_INVALID", add);
  });
  if (APPLICATION_TIER_IDS.some((id) => !seen.has(id))) add("LANE_ID_MISSING", "$.lanes");
  if (allocation !== 100) add("LANE_ALLOCATION_NOT_NORMALIZED", "$.lanes");
}

/** @param {Record<string, unknown>} value @param {string[]} keys @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function allowed(value, keys, path, code, add) { Object.keys(value).forEach((key) => { if (!keys.includes(key)) add(code, `${path}.${key}`); }); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function requiredString(value, path, code, add) { if (typeof value !== "string" || !value.trim()) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function stringArray(value, path, code, add) { if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) add(code, path); }
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
