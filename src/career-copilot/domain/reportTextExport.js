import { createReportDisclosure } from "./reportDisclosure.js";

export const REPORT_TEXT_EXPORT_VERSION = "1.0.0";

/** @typedef {{ company: { name: string }, roleFamily: { label: string }, entrance: { url: string }, source: { title: string, verifiedAt: string }, verification: { status: string } }} ExportCompanyCandidate */
/** @typedef {{ datasetVersion: string, status?: string, asOfDate?: string, candidates: ExportCompanyCandidate[], disclaimer: string }} ExportCompanyRecommendations */

/**
 * Builds a plain-text, privacy-minimized report from structured conclusions.
 * It intentionally accepts no resume text, private fields or file metadata.
 * @param {{
 *  analysis: ReturnType<import("./careerProfileAnalysis.js").analyzeCareerProfile>,
 *  jdGapAnalysis?: import("./jdGapAnalysis.js").JdGapAnalysis | null,
 *  applicationTierPlan?: import("./applicationTierPlan.js").ApplicationTierPlan | null,
 *  actionPlan?: import("./actionPlan.js").ActionPlan | null,
 *  companyRoleRecommendations?: ExportCompanyRecommendations | null,
 *  evidenceDegradation?: import("./evidenceDegradation.js").EvidenceDegradationPlan | null,
 *  generatedAt?: string,
 * }} input
 */
export function buildPrivacySafeReportText(input) {
  if (!input?.analysis) throw new ReportTextExportError("ANALYSIS_REQUIRED");
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(generatedAt))) throw new ReportTextExportError("GENERATED_AT_INVALID");
  const { analysis, jdGapAnalysis, applicationTierPlan, actionPlan, companyRoleRecommendations, evidenceDegradation } = input;
  const disclosure = createReportDisclosure({
    asOfDate: companyRoleRecommendations?.asOfDate,
    hasCompanyData: Boolean(companyRoleRecommendations?.candidates?.length),
    companyDataNeedsVerification: companyRoleRecommendations?.status === "needs_verification",
  });
  const direction = analysis.direction.selectedLabel ?? "暂不能判断";
  const visibleGaps = [...analysis.gaps, ...analysis.insufficient]
    .filter((item) => degradationOutcome(evidenceDegradation, item.id) !== "omitted")
    .slice(0, 3);
  const lines = [
    "MoreThan 智能求职助手｜脱敏诊断报告",
    `生成时间：${formatChinaTime(generatedAt)}`,
    `主方向：${direction}`,
    `规则版本：${analysis.ruleSetVersion}`,
    `岗位画像版本：${analysis.roleProfileVersion}`,
    `公司知识包版本：${companyRoleRecommendations?.datasetVersion ?? "未使用"}`,
    "",
    "【30 秒结论】",
    analysis.strengths.length
      ? `当前简历已为“${direction}”形成 ${analysis.strengths.length} 项可用优势证据。`
      : `当前简历对“${direction}”的证据仍有限，建议先补充事实再判断。`,
    visibleGaps.length ? `当前有 ${visibleGaps.length} 项证据短板或信息缺口需要优先处理。` : "当前没有需要优先展示的证据短板。",
    "",
    "【核心优势】",
    ...numbered(analysis.strengths.slice(0, 3), (item) => `${item.claim}\n   依据：本地规则 ${item.ruleId}；${item.factIds.length} 条已确认事实`),
    ...(analysis.strengths.length ? [] : ["暂无达到展示门槛的优势证据。"]),
    "",
    "【主要短板与信息缺口】",
    ...numbered(visibleGaps, (item) => `${degradationDisplay(evidenceDegradation, item.id, item.claim)}\n   下一步：${item.nextAction}\n   依据：本地规则 ${item.ruleId}`),
    ...(visibleGaps.length ? [] : ["暂无需要优先展示的证据短板。"]),
  ];

  if (jdGapAnalysis) {
    const priority = jdGapAnalysis.items.filter((item) => item.status !== "covered").slice(0, 5);
    lines.push("", "【简历 × JD】", `直接覆盖 ${jdGapAnalysis.summary.covered}｜证据较弱 ${jdGapAnalysis.summary.partial}｜未找到 ${jdGapAnalysis.summary.notFound}`);
    lines.push(...numbered(priority, (item) => `${item.jdText}\n   状态：${jdStatus(item.status)}；下一步：${item.nextAction}`));
    if (!priority.length) lines.push("当前提取到的 JD 条目均找到直接相关证据，仍需核对表述真实性。");
  } else {
    lines.push("", "【简历 × JD】", "本次未提供具体 JD，未进行岗位级差距比较。");
  }

  if (applicationTierPlan) {
    lines.push("", "【四层投递组合】");
    lines.push(...applicationTierPlan.lanes.map((lane) => `${lane.label} ${lane.allocationPercent}%｜${lane.targetLabel}\n   ${lane.rationale}\n   条件：${lane.condition}`));
  }

  if (companyRoleRecommendations?.candidates?.length) {
    lines.push("", "【公司目标池】");
    lines.push(...numbered(companyRoleRecommendations.candidates, (candidate) => `${candidate.company.name}｜${candidate.roleFamily.label}\n   官方入口：${candidate.entrance.url}\n   来源：${candidate.source.title}（核验于 ${candidate.source.verifiedAt}）\n   状态：${candidate.verification.status === "current" ? "当前复核期内" : "待自行核实"}`));
  }

  if (actionPlan) {
    lines.push("", "【下一步行动】");
    for (const window of ["48_hours", "7_days", "30_days"]) {
      const items = actionPlan.items.filter((item) => item.window === window);
      lines.push(`${actionWindowLabel(window)}：`);
      lines.push(...numbered(items, (item) => `${item.title}\n   产出物：${item.deliverable}；预计 ${item.estimatedMinutes} 分钟`));
      if (!items.length) lines.push("暂无任务。");
    }
  }

  lines.push(
    "",
    "【使用边界】",
    `生成方式：${disclosure.generation.badge}。${disclosure.generation.text}`,
    `隐私与保存：${disclosure.privacy.badge}。${disclosure.privacy.text}`,
    `结果边界：${disclosure.outcome.badge}。${disclosure.outcome.text}`,
    `信息时效：${disclosure.freshness.badge}。${disclosure.freshness.text}`,
    analysis.disclaimer,
    companyRoleRecommendations?.disclaimer ?? "公司与岗位信息可能变化，申请前请通过官方招聘页面核验。",
    "为保护隐私，本脱敏文本不包含姓名、联系方式、完整简历原文或原始文件信息。",
  );
  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n").trim();
}

export class ReportTextExportError extends Error {
  /** @param {string} code */
  constructor(code) { super(code); this.name = "ReportTextExportError"; this.code = code; }
}

/** @template T @param {T[]} items @param {(item: T) => string} format */
function numbered(items, format) { return items.map((item, index) => `${index + 1}. ${format(item)}`); }
/** @param {import("./evidenceDegradation.js").EvidenceDegradationPlan | null | undefined} plan @param {string} conclusionId */
function degradationOutcome(plan, conclusionId) { return plan?.items?.find((item) => item.conclusionId === conclusionId)?.outcome ?? null; }
/** @param {import("./evidenceDegradation.js").EvidenceDegradationPlan | null | undefined} plan @param {string} conclusionId @param {string} fallback */
function degradationDisplay(plan, conclusionId, fallback) { return plan?.items?.find((item) => item.conclusionId === conclusionId)?.displayTitle ?? fallback; }
/** @param {import("./jdGapAnalysis.js").JdGapItem["status"]} status */
function jdStatus(status) { return { covered: "直接覆盖", partial: "证据较弱", not_found: "未找到证据" }[status] ?? "待核实"; }
/** @param {import("./actionPlan.js").ActionWindow} window */
function actionWindowLabel(window) { return { "48_hours": "48 小时", "7_days": "7 天", "30_days": "30 天" }[window]; }
/** @param {string} value */
function formatChinaTime(value) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)).replaceAll("/", "-"); }
