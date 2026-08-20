export const JD_PROFILE_SCHEMA_VERSION = "1.0.0";
export const JD_EXTRACTOR_VERSION = "1.0.0";

export const JD_RISK_TYPES = Object.freeze(["discriminatory_language", "payment_request", "sensitive_data_request", "vague_compensation", "excessive_requirement"]);

const TASK_KEYWORDS = Object.freeze(["用户调研", "需求分析", "产品设计", "项目管理", "数据分析", "用户增长", "内容运营", "活动运营", "品牌营销", "市场调研", "软件开发", "系统设计", "测试", "部署", "商业分析", "财务分析", "审计", "风险管理"]);
const SKILL_KEYWORDS = Object.freeze(["SQL", "Python", "Java", "JavaScript", "TypeScript", "React", "Vue", "C++", "Excel", "Tableau", "Power BI", "Figma", "Axure", "Git", "CPA", "CFA", "英语", "英文"]);
const THRESHOLD_KEYWORDS = Object.freeze(["本科", "硕士", "博士", "学历", "应届", "实习", "每周", "到岗", "毕业", "经验", "年", "天"]);

/** @typedef {{ id: string, text: string, keywords: string[], sourceLine: number }} JdItem */
/** @typedef {{ id: string, type: typeof JD_RISK_TYPES[number], text: string, sourceLine: number, guidance: string }} JdRiskItem */
/** @typedef {{ schemaVersion: string, extractorVersion: string, source: { characterCount: number, lineCount: number }, responsibilities: JdItem[], requirements: { required: JdItem[], preferred: JdItem[] }, keywords: { task: string[], skill: string[], threshold: string[] }, riskItems: JdRiskItem[], coverage: { hasResponsibilities: boolean, hasRequired: boolean, hasPreferred: boolean }, createdAt: string }} JdProfile */
/** @typedef {{ code: string, path: string }} JdValidationError */

export class JdExtractionError extends Error {
  /** @param {string} code */
  constructor(code) { super(code); this.name = "JdExtractionError"; this.code = code; }
}

/** @param {string} text @param {{ now?: string }=} options @returns {JdProfile} */
export function extractJdProfile(text, options = {}) {
  if (typeof text !== "string") throw new JdExtractionError("JD_INPUT_INVALID");
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").trim();
  if (normalized.length < 20) throw new JdExtractionError("JD_TEXT_TOO_SHORT");
  if (normalized.length > 30000) throw new JdExtractionError("JD_TEXT_TOO_LONG");

  const sourceLines = normalized.split("\n");
  /** @type {JdItem[]} */
  const responsibilities = [];
  /** @type {JdItem[]} */
  const required = [];
  /** @type {JdItem[]} */
  const preferred = [];
  /** @type {JdRiskItem[]} */
  const riskItems = [];
  /** @type {"responsibility" | "required" | "preferred" | null} */
  let section = null;

  sourceLines.forEach((rawLine, index) => {
    const line = cleanLine(rawLine);
    if (!line) return;
    const heading = classifyHeading(line);
    if (heading) { section = heading; return; }
    const sourceLine = index + 1;
    const risk = detectRisk(line, sourceLine, riskItems.length + 1);
    if (risk) riskItems.push(risk);
    const item = createItem(line, sourceLine, responsibilities.length + required.length + preferred.length + 1);
    const category = classifyLine(line, section);
    if (category === "preferred") preferred.push(item);
    else if (category === "required") required.push(item);
    else if (category === "responsibility") responsibilities.push(item);
  });

  const profile = {
    schemaVersion: JD_PROFILE_SCHEMA_VERSION,
    extractorVersion: JD_EXTRACTOR_VERSION,
    source: { characterCount: normalized.length, lineCount: sourceLines.length },
    responsibilities: deduplicateItems(responsibilities),
    requirements: { required: deduplicateItems(required), preferred: deduplicateItems(preferred) },
    keywords: {
      task: collectKeywords(normalized, TASK_KEYWORDS),
      skill: collectKeywords(normalized, SKILL_KEYWORDS),
      threshold: collectKeywords(normalized, THRESHOLD_KEYWORDS),
    },
    riskItems: deduplicateRisks(riskItems),
    coverage: { hasResponsibilities: responsibilities.length > 0, hasRequired: required.length > 0, hasPreferred: preferred.length > 0 },
    createdAt: options.now ?? new Date().toISOString(),
  };
  const validation = validateJdProfile(profile);
  if (!validation.valid) throw new JdExtractionError(validation.errors[0]?.code ?? "JD_PROFILE_INVALID");
  return profile;
}

/** @param {unknown} value @returns {{ valid: boolean, errors: JdValidationError[] }} */
export function validateJdProfile(value) {
  /** @type {JdValidationError[]} */
  const errors = [];
  /** @param {string} code @param {string} path */
  const add = (code, path) => errors.push({ code, path });
  if (!isRecord(value)) return { valid: false, errors: [{ code: "ROOT_INVALID", path: "$" }] };
  allowed(value, ["schemaVersion", "extractorVersion", "source", "responsibilities", "requirements", "keywords", "riskItems", "coverage", "createdAt"], "$", "ROOT_KEY_UNKNOWN", add);
  if (value.schemaVersion !== JD_PROFILE_SCHEMA_VERSION) add("SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion");
  if (value.extractorVersion !== JD_EXTRACTOR_VERSION) add("EXTRACTOR_VERSION_UNSUPPORTED", "$.extractorVersion");
  validateSource(value.source, add);
  validateItems(value.responsibilities, "$.responsibilities", add);
  if (!isRecord(value.requirements)) add("REQUIREMENTS_INVALID", "$.requirements");
  else {
    allowed(value.requirements, ["required", "preferred"], "$.requirements", "REQUIREMENTS_KEY_UNKNOWN", add);
    validateItems(value.requirements.required, "$.requirements.required", add);
    validateItems(value.requirements.preferred, "$.requirements.preferred", add);
  }
  validateKeywords(value.keywords, add);
  validateRisks(value.riskItems, add);
  validateCoverage(value.coverage, add);
  if (typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt))) add("CREATED_AT_INVALID", "$.createdAt");
  return { valid: errors.length === 0, errors };
}

/** @param {string} line */
function classifyHeading(line) {
  const compact = line.replace(/[：:]/g, "").trim().toLowerCase();
  if (/^(岗位职责|职位职责|工作职责|工作内容|职责描述|responsibilities|what you will do|the role)$/.test(compact)) return /** @type {const} */ ("responsibility");
  if (/^(加分项|优先条件|优先考虑|加分要求|preferred|preferred qualifications|nice to have|bonus points)$/.test(compact)) return /** @type {const} */ ("preferred");
  if (/^(任职要求|岗位要求|职位要求|基本要求|资格要求|任职资格|requirements|required qualifications|qualifications|what we look for)$/.test(compact)) return /** @type {const} */ ("required");
  return null;
}

/** @param {string} line @param {"responsibility" | "required" | "preferred" | null} section */
function classifyLine(line, section) {
  if (/(加分|优先|nice to have|preferred|bonus)/i.test(line)) return "preferred";
  if (section) return section;
  if (/(要求|必须|需具备|熟练|掌握|本科|硕士|学历|经验|每周|到岗|required|must|proficient|experience|degree)/i.test(line)) return "required";
  if (/(负责|参与|推动|协助|制定|搭建|分析|跟进|维护|设计|开发|完成|support|build|design|develop|manage|analyze|drive|own)/i.test(line)) return "responsibility";
  return null;
}

/** @param {string} line @param {number} sourceLine @param {number} index @returns {JdRiskItem | null} */
function detectRisk(line, sourceLine, index) {
  const patterns = [
    ["payment_request", /(缴费|收费|培训费|押金|保证金|先付款|payment|deposit|training fee)/i, "招聘流程涉及费用时，建议通过公司官方渠道核实，不要直接付款。"],
    ["sensitive_data_request", /(身份证原件|银行卡号|银行账户|征信报告|家庭住址|passport number|bank account|credit report)/i, "在正式录用与必要流程前，谨慎提供高敏感个人信息。"],
    ["discriminatory_language", /(仅限男性|仅限女性|男性优先|女性优先|未婚|已婚已育|年龄不超过\s*\d+|限\d+岁以下|male only|female only|under age \d+)/i, "该限制可能与岗位能力无直接关系，建议核实招聘方的真实要求和适用边界。"],
    ["vague_compensation", /(高薪面议|收入无上限|轻松月入|日结高薪|unlimited income|easy money)/i, "薪酬表达较模糊，建议核实固定薪资、绩效口径和劳动关系。"],
    ["excessive_requirement", /(无偿加班|接受长期加班|24小时待命|随叫随到|unpaid overtime|24\/7 availability)/i, "工作时间要求较强，建议核实实际频率、补偿和岗位边界。"],
  ];
  const matched = patterns.find(([, pattern]) => /** @type {RegExp} */ (pattern).test(line));
  if (!matched) return null;
  return { id: `jd-risk-${String(index).padStart(3, "0")}`, type: /** @type {typeof JD_RISK_TYPES[number]} */ (matched[0]), text: line, sourceLine, guidance: /** @type {string} */ (matched[2]) };
}

/** @param {string} text @param {number} sourceLine @param {number} index @returns {JdItem} */
function createItem(text, sourceLine, index) { return { id: `jd-item-${String(index).padStart(3, "0")}`, text, keywords: collectKeywords(text, [...TASK_KEYWORDS, ...SKILL_KEYWORDS, ...THRESHOLD_KEYWORDS]), sourceLine }; }
/** @param {string} text @param {readonly string[]} dictionary */
function collectKeywords(text, dictionary) { return dictionary.filter((keyword) => text.toLowerCase().includes(keyword.toLowerCase())); }
/** @param {string} line */
function cleanLine(line) { return line.replace(/^\s*(?:[-*•·▪◦]|\d+[.)、])\s*/, "").replace(/\s+/g, " ").trim(); }
/** @param {JdItem[]} items */
function deduplicateItems(items) { const seen = new Set(); return items.filter((item) => { const key = item.text.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }); }
/** @param {JdRiskItem[]} items */
function deduplicateRisks(items) { const seen = new Set(); return items.filter((item) => { const key = `${item.type}:${item.text.toLowerCase()}`; if (seen.has(key)) return false; seen.add(key); return true; }); }

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateSource(value, add) {
  if (!isRecord(value)) { add("SOURCE_INVALID", "$.source"); return; }
  allowed(value, ["characterCount", "lineCount"], "$.source", "SOURCE_KEY_UNKNOWN", add);
  if (!Number.isInteger(value.characterCount) || /** @type {number} */ (value.characterCount) < 20) add("SOURCE_CHARACTER_COUNT_INVALID", "$.source.characterCount");
  if (!Number.isInteger(value.lineCount) || /** @type {number} */ (value.lineCount) < 1) add("SOURCE_LINE_COUNT_INVALID", "$.source.lineCount");
}
/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function validateItems(value, path, add) {
  if (!Array.isArray(value)) { add("ITEMS_INVALID", path); return; }
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) { add("ITEM_INVALID", itemPath); return; }
    allowed(item, ["id", "text", "keywords", "sourceLine"], itemPath, "ITEM_KEY_UNKNOWN", add);
    if (typeof item.id !== "string" || !item.id) add("ITEM_ID_INVALID", `${itemPath}.id`);
    if (typeof item.text !== "string" || !item.text.trim()) add("ITEM_TEXT_INVALID", `${itemPath}.text`);
    if (!Array.isArray(item.keywords) || item.keywords.some((keyword) => typeof keyword !== "string")) add("ITEM_KEYWORDS_INVALID", `${itemPath}.keywords`);
    if (!Number.isInteger(item.sourceLine) || /** @type {number} */ (item.sourceLine) < 1) add("ITEM_SOURCE_LINE_INVALID", `${itemPath}.sourceLine`);
  });
}
/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateKeywords(value, add) {
  if (!isRecord(value)) { add("KEYWORDS_INVALID", "$.keywords"); return; }
  allowed(value, ["task", "skill", "threshold"], "$.keywords", "KEYWORDS_KEY_UNKNOWN", add);
  for (const key of ["task", "skill", "threshold"]) if (!Array.isArray(value[key]) || value[key].some((item) => typeof item !== "string")) add("KEYWORD_LIST_INVALID", `$.keywords.${key}`);
}
/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateRisks(value, add) {
  if (!Array.isArray(value)) { add("RISKS_INVALID", "$.riskItems"); return; }
  value.forEach((item, index) => {
    const path = `$.riskItems[${index}]`;
    if (!isRecord(item)) { add("RISK_INVALID", path); return; }
    allowed(item, ["id", "type", "text", "sourceLine", "guidance"], path, "RISK_KEY_UNKNOWN", add);
    if (typeof item.id !== "string" || !item.id) add("RISK_ID_INVALID", `${path}.id`);
    if (!JD_RISK_TYPES.includes(/** @type {typeof JD_RISK_TYPES[number]} */ (item.type))) add("RISK_TYPE_INVALID", `${path}.type`);
    if (typeof item.text !== "string" || !item.text) add("RISK_TEXT_INVALID", `${path}.text`);
    if (!Number.isInteger(item.sourceLine) || /** @type {number} */ (item.sourceLine) < 1) add("RISK_SOURCE_LINE_INVALID", `${path}.sourceLine`);
    if (typeof item.guidance !== "string" || !item.guidance) add("RISK_GUIDANCE_INVALID", `${path}.guidance`);
  });
}
/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateCoverage(value, add) {
  if (!isRecord(value)) { add("COVERAGE_INVALID", "$.coverage"); return; }
  allowed(value, ["hasResponsibilities", "hasRequired", "hasPreferred"], "$.coverage", "COVERAGE_KEY_UNKNOWN", add);
  for (const key of ["hasResponsibilities", "hasRequired", "hasPreferred"]) if (typeof value[key] !== "boolean") add("COVERAGE_VALUE_INVALID", `$.coverage.${key}`);
}
/** @param {Record<string, unknown>} value @param {string[]} keys @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function allowed(value, keys, path, code, add) { Object.keys(value).forEach((key) => { if (!keys.includes(key)) add(code, `${path}.${key}`); }); }
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
