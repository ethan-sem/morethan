export const ROLE_PROFILE_VERSION = "1.0.0";
export const AUTO_ROLE_PROFILE_ID = "auto";

export const ROLE_PROFILES = Object.freeze([
  profile("product-manager", "产品经理", ["产品", "需求", "用户", "调研", "原型", "迭代", "功能", "场景", "体验", "竞品"], ["SQL", "Axure", "Figma", "数据分析"]),
  profile("product-operations", "产品/用户运营", ["运营", "用户增长", "活动", "社群", "留存", "转化", "内容", "复盘", "拉新", "召回"], ["Excel", "SQL", "数据分析", "文案"]),
  profile("marketing-growth", "市场/品牌/增长", ["市场", "品牌", "增长", "投放", "传播", "营销", "渠道", "内容", "转化", "活动"], ["广告", "SEO", "SEM", "数据分析"]),
  profile("software-engineering", "软件研发", ["开发", "系统", "接口", "性能", "架构", "测试", "部署", "服务", "算法", "工程"], ["Java", "Python", "JavaScript", "React", "C++", "Git"]),
  profile("data-business-analysis", "数据分析/商业分析", ["数据", "分析", "指标", "看板", "建模", "洞察", "商业", "策略", "预测", "报表"], ["SQL", "Python", "Excel", "Tableau", "Power BI", "统计"]),
  profile("finance-accounting", "金融/财会通用", ["财务", "会计", "审计", "估值", "投资", "研究", "预算", "报表", "风控", "成本"], ["CPA", "CFA", "Excel", "财务分析"]),
]);

/** @param {string} id @returns {typeof ROLE_PROFILES[number] | null} */
export function getRoleProfile(id) {
  return ROLE_PROFILES.find((item) => item.id === id) ?? null;
}

/** @param {string} value @returns {string} */
export function normalizeRoleProfileId(value) {
  const normalized = value.trim().toLowerCase();
  if (["auto", "请先帮我判断", "help-me-decide"].includes(normalized)) return AUTO_ROLE_PROFILE_ID;
  const direct = getRoleProfile(normalized);
  if (direct) return direct.id;
  const byLabel = ROLE_PROFILES.find((item) => item.label.toLowerCase() === normalized);
  return byLabel?.id ?? AUTO_ROLE_PROFILE_ID;
}

/** @param {string} id @param {string} label @param {string[]} taskKeywords @param {string[]} skillKeywords */
function profile(id, label, taskKeywords, skillKeywords) {
  return Object.freeze({ id, label, taskKeywords: Object.freeze(taskKeywords), skillKeywords: Object.freeze(skillKeywords) });
}
