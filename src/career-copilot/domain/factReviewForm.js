import { createResumeFact } from "./resumeFacts.js";
import { normalizeDateToken } from "../extractors/dateRange.js";
import { maskPrivateFieldsInText } from "../privacy/piiDetector.js";

/** @typedef {ReturnType<typeof createResumeFact>} ResumeFact */
/** @typedef {ResumeFact["category"]} FactCategory */

export const FACT_CATEGORY_LABELS = Object.freeze({
  education: "教育经历",
  internship: "实习经历",
  project: "项目经历",
  campus: "校园经历",
  skill: "技能",
  certification: "证书认证",
  achievement: "成果奖项",
});

export const FACT_FORM_FIELDS = Object.freeze({
  education: [{ key: "institution", label: "学校/院校" }, { key: "degree", label: "学历" }, { key: "major", label: "专业" }, { key: "startDate", label: "开始日期", type: "date" }, { key: "endDate", label: "结束日期", type: "date" }, { key: "highlights", label: "亮点（每行一项）", type: "list" }],
  internship: [{ key: "organization", label: "公司/组织" }, { key: "role", label: "岗位" }, { key: "location", label: "地点" }, { key: "startDate", label: "开始日期", type: "date" }, { key: "endDate", label: "结束日期", type: "date" }, { key: "actions", label: "个人动作（每行一项）", type: "list" }, { key: "methods", label: "方法（每行一项）", type: "list" }, { key: "results", label: "结果（每行一项）", type: "list" }, { key: "metrics", label: "指标（每行一项）", type: "list" }],
  project: [{ key: "name", label: "项目名称" }, { key: "role", label: "角色" }, { key: "startDate", label: "开始日期", type: "date" }, { key: "endDate", label: "结束日期", type: "date" }, { key: "actions", label: "个人动作（每行一项）", type: "list" }, { key: "methods", label: "方法（每行一项）", type: "list" }, { key: "results", label: "结果（每行一项）", type: "list" }, { key: "metrics", label: "指标（每行一项）", type: "list" }, { key: "technologies", label: "工具（每行一项）", type: "list" }],
  campus: [{ key: "organization", label: "组织" }, { key: "role", label: "职务" }, { key: "startDate", label: "开始日期", type: "date" }, { key: "endDate", label: "结束日期", type: "date" }, { key: "actions", label: "个人动作（每行一项）", type: "list" }, { key: "results", label: "结果（每行一项）", type: "list" }],
  skill: [{ key: "name", label: "技能名称" }, { key: "level", label: "熟练度" }, { key: "keywords", label: "关键词（每行一项）", type: "list" }],
  certification: [{ key: "name", label: "证书名称" }, { key: "issuer", label: "颁发方" }, { key: "issuedAt", label: "获得日期", type: "date" }, { key: "expiresAt", label: "过期日期", type: "date" }, { key: "credentialId", label: "凭证编号" }],
  achievement: [{ key: "title", label: "成果/奖项" }, { key: "issuer", label: "颁发方" }, { key: "receivedAt", label: "获得日期", type: "date" }, { key: "level", label: "级别" }, { key: "description", label: "说明", type: "longtext" }],
});

export class FactReviewFormError extends Error {
  /** @param {string} code @param {string} field */
  constructor(code, field) {
    super(code);
    this.name = "FactReviewFormError";
    this.code = code;
    this.field = field;
  }
}

/** @param {FactCategory} category */
export function createBlankFactDraft(category) {
  return createResumeFact({ id: "fact-draft", category, provenance: "user_added" });
}

/** @param {ResumeFact} fact */
export function factToFormValues(fact) {
  /** @type {Record<string, string | boolean>} */
  const values = {};
  FACT_FORM_FIELDS[fact.category].forEach((field) => {
    const value = fact.data[field.key];
    values[field.key] = Array.isArray(value) ? value.join("\n") : typeof value === "string" ? value : "";
  });
  if ("dateRange" in fact.data) {
    const range = /** @type {{ start?: { value?: string | null } | null, end?: { value?: string | null } | null, ongoing?: boolean } | null} */ (fact.data.dateRange);
    values.startDate = range?.start?.value ?? "";
    values.endDate = range?.end?.value ?? "";
    values.ongoing = Boolean(range?.ongoing);
  }
  ["issuedAt", "expiresAt", "receivedAt"].forEach((key) => {
    const value = fact.data[key];
    if (value && typeof value === "object" && "value" in value) values[key] = typeof value.value === "string" ? value.value : "";
  });
  return values;
}

/** @param {ResumeFact} fact @param {Record<string, string | boolean>} values */
export function formValuesToFactData(fact, values) {
  const data = structuredClone(fact.data);
  FACT_FORM_FIELDS[fact.category].forEach((field) => {
    if (field.type === "date") return;
    const value = String(values[field.key] ?? "").trim();
    data[field.key] = field.type === "list" ? splitList(value) : value || null;
  });
  if ("dateRange" in data) {
    const start = parseFormDate(String(values.startDate ?? ""), "startDate");
    const end = parseFormDate(String(values.endDate ?? ""), "endDate");
    const ongoing = Boolean(values.ongoing);
    data.dateRange = start || end || ongoing ? { start, end: ongoing ? null : end, ongoing } : null;
  }
  ["issuedAt", "expiresAt", "receivedAt"].forEach((key) => {
    if (key in data) data[key] = parseFormDate(String(values[key] ?? ""), key);
  });
  return data;
}

/** @param {ResumeFact} fact */
export function formatFactSummary(fact) {
  const data = fact.data;
  const primary = fact.category === "education" ? [data.institution, data.degree, data.major]
    : fact.category === "internship" ? [data.organization, data.role, data.location]
      : fact.category === "project" ? [data.name, data.role]
        : fact.category === "campus" ? [data.organization, data.role]
          : fact.category === "skill" ? [data.name, data.level]
            : fact.category === "certification" ? [data.name, data.issuer]
              : [data.title, data.level, data.issuer];
  const date = formatFactDate(data);
  return [...primary, date].filter((value) => typeof value === "string" && value.trim()).join(" · ") || "尚未填写核心字段";
}

/** @param {string} text @param {ResumeFact} fact @param {Array<{ maskedValue: string, reviewStatus: "detected" | "confirmed" | "dismissed", sourceRefs: Array<{ documentId: string, startOffset: number, endOffset: number, page: number | null, section: string | null }> }>} privateFields */
export function getMaskedFactSourceExcerpt(text, fact, privateFields) {
  const source = fact.sourceRefs[0];
  if (!source) return "用户手动新增，无原文来源。";
  const raw = text.slice(source.startOffset, source.endOffset);
  const relativeFields = privateFields.flatMap((field, index) => {
    const refs = field.sourceRefs.filter((ref) => ref.documentId === source.documentId && ref.startOffset < source.endOffset && ref.endOffset > source.startOffset).map((ref) => ({ ...ref, startOffset: Math.max(ref.startOffset, source.startOffset) - source.startOffset, endOffset: Math.min(ref.endOffset, source.endOffset) - source.startOffset }));
    return refs.length ? [{ id: `excerpt-${index}`, type: /** @type {"other"} */ ("other"), maskedValue: field.maskedValue, sourceRefs: refs, confidence: /** @type {"high"} */ ("high"), reviewStatus: field.reviewStatus }] : [];
  });
  const masked = maskPrivateFieldsInText(raw, relativeFields).trim();
  return masked.length > 320 ? `${masked.slice(0, 320)}…` : masked;
}

/** @param {string} value */
function splitList(value) {
  return value.split(/\r?\n|[；;]/gu).map((item) => item.trim()).filter(Boolean);
}

/** @param {string} value @param {string} field */
function parseFormDate(value, field) {
  if (!value.trim()) return null;
  const date = normalizeDateToken(value.trim());
  if (!date) throw new FactReviewFormError("DATE_INVALID", field);
  return date;
}

/** @param {Record<string, unknown>} data */
function formatFactDate(data) {
  if (data.dateRange && typeof data.dateRange === "object") {
    const range = /** @type {{ start?: { value?: string | null } | null, end?: { value?: string | null } | null, ongoing?: boolean }} */ (data.dateRange);
    const start = range.start?.value;
    const end = range.ongoing ? "至今" : range.end?.value;
    return [start, end].filter(Boolean).join("—");
  }
  for (const key of ["issuedAt", "receivedAt"]) {
    const date = data[key];
    if (date && typeof date === "object" && "value" in date && typeof date.value === "string") return date.value;
  }
  return null;
}
