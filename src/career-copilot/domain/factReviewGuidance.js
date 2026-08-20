/** @typedef {ReturnType<import("./resumeFacts.js").createResumeFact>} ResumeFact */

export const FACT_REVIEW_GUIDANCE_VERSION = "1.0.0";

const CATEGORY_GUIDANCE = Object.freeze({
  education: "核对院校、学历、专业和起止时间；不确定时可查看成绩单或学信网信息。",
  internship: "优先补充公司、岗位、你的具体动作和结果；不要把团队整体成果当成个人事实。",
  project: "核对项目名称、你的角色、个人动作和可证明的成果；团队项目要区分个人贡献。",
  campus: "核对组织、职务和你实际负责的事项；仅参与但未负责的内容不要写成主导。",
  skill: "只有能解释或举证的技能才建议确认；仅出现过工具名称不等于熟练掌握。",
  certification: "核对证书全名、颁发方和时间；没有凭证时不要补造编号。",
  achievement: "核对奖项名称、级别、颁发方和时间；入围、提名和获奖应明确区分。",
});

const REASON_LABELS = Object.freeze(/** @type {Record<string, string>} */ ({
  section_inferred: "未发现明确章节标题",
  primary_field_detected: "识别到核心名称",
  date_range_detected: "识别到日期范围",
  item_boundary_detected: "识别到独立条目边界",
  section_heading: "识别到明确章节标题",
  user_added: "由用户手动补充",
}));

/** @param {ResumeFact} fact */
export function getFactReviewGuidance(fact) {
  const missing = getMissingEvidenceLabels(fact);
  const reasonLabels = fact.confidence.reasons.map((reason) => REASON_LABELS[reason] ?? reason);
  const needsAttention = fact.confidence.level === "low" || missing.length > 0;
  return {
    needsAttention,
    title: fact.confidence.level === "low" ? "低置信：请勿直接当作已证实履历" : missing.length ? "信息不完整：建议确认或补充" : "识别依据较完整",
    description: CATEGORY_GUIDANCE[fact.category],
    missing,
    reasons: reasonLabels,
  };
}

/** @param {ResumeFact} fact */
function getMissingEvidenceLabels(fact) {
  const data = fact.data;
  /** @type {string[]} */
  const missing = [];
  if (fact.category === "education") {
    if (!hasText(data.institution)) missing.push("院校");
    if (!hasText(data.degree)) missing.push("学历");
    if (!data.dateRange) missing.push("时间");
  }
  if (fact.category === "internship") {
    if (!hasText(data.organization)) missing.push("公司/组织");
    if (!hasText(data.role)) missing.push("岗位");
    if (!data.dateRange) missing.push("时间");
    if (!hasAny(data.actions) && !hasAny(data.results)) missing.push("个人动作或结果");
  }
  if (fact.category === "project") {
    if (!hasText(data.name)) missing.push("项目名称");
    if (!hasText(data.role)) missing.push("个人角色");
    if (!hasAny(data.actions) && !hasAny(data.results)) missing.push("个人动作或结果");
  }
  if (fact.category === "campus") {
    if (!hasText(data.organization)) missing.push("组织");
    if (!hasText(data.role)) missing.push("职务");
  }
  if (fact.category === "skill" && !hasText(data.name)) missing.push("技能名称");
  if (fact.category === "certification" && !hasText(data.name)) missing.push("证书名称");
  if (fact.category === "achievement" && !hasText(data.title)) missing.push("成果/奖项名称");
  return missing;
}

/** @param {unknown} value */
function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** @param {unknown} value */
function hasAny(value) {
  return Array.isArray(value) && value.some(hasText);
}
