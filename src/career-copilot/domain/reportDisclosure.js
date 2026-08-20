export const REPORT_DISCLOSURE_VERSION = "1.0.0";

/**
 * Central disclosure copy shared by the visible report and privacy-safe export.
 * @param {{ asOfDate?: string | null, hasCompanyData?: boolean, companyDataNeedsVerification?: boolean }} input
 */
export function createReportDisclosure(input = {}) {
  const asOfDate = isIsoDate(input.asOfDate) ? /** @type {string} */ (input.asOfDate) : null;
  const freshnessStatus = input.hasCompanyData
    ? input.companyDataNeedsVerification ? "needs_verification" : "current"
    : "not_used";
  return Object.freeze({
    version: REPORT_DISCLOSURE_VERSION,
    generation: Object.freeze({
      label: "生成方式",
      badge: "本地规则生成（非生成式 AI）",
      text: "本报告由浏览器内的确定性规则，根据你确认的简历事实、所选方向与可选 JD 生成；当前版本不调用生成式 AI，也不会把简历发送给模型服务。",
    }),
    privacy: Object.freeze({
      label: "隐私与保存",
      badge: "敏感内容仅驻留当前页面",
      text: "原始文件、简历正文、JD 与诊断报告默认只保留在当前页面内存，不自动保存；仅非敏感的流程位置可暂存于本次浏览器会话。刷新或关闭页面前请先复制或保存 PDF。",
    }),
    outcome: Object.freeze({
      label: "结果边界",
      badge: "不构成录用保证",
      text: "结论仅供实习与校招规划参考，不代表招聘方评价、真实能力上限、面试邀请、录用概率或 offer 保证，也不能替代你对事实和申请材料的最终核对。",
    }),
    freshness: Object.freeze({
      label: "信息时效",
      badge: freshnessBadge(freshnessStatus, asOfDate),
      status: freshnessStatus,
      asOfDate,
      text: freshnessText(freshnessStatus, asOfDate),
    }),
  });
}

/** @param {string | null | undefined} value */
function isIsoDate(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }

/** @param {string} status @param {string | null} date */
function freshnessBadge(status, date) {
  if (status === "not_used") return "本次未使用公司资料";
  if (status === "needs_verification") return `资料待自行核实${date ? ` · 查看日期 ${date}` : ""}`;
  return `资料处于复核期内${date ? ` · 查看日期 ${date}` : ""}`;
}

/** @param {string} status @param {string | null} date */
function freshnessText(status, date) {
  if (status === "not_used") return "本次报告未使用公司目标池资料；如自行查找岗位，请以申请当日的招聘方官方页面为准。";
  const dateText = date ? `本次资料状态查看日期为 ${date}；` : "";
  if (status === "needs_verification") return `${dateText}部分公开资料已超过复核期限，仅保留入口供你自行核对，不代表存在实时职位。申请前必须查看招聘方官方页面。`;
  return `${dateText}“复核期内”只表示公开入口在维护周期内完成过核验，不代表岗位仍在招聘。申请前请逐条查看所示核验日期，并以招聘方官方页面为准。`;
}
