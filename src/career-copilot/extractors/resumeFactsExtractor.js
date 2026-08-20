import { createEmptyResumeFacts, createResumeFact, RESUME_SOURCE_FORMATS } from "../domain/resumeFacts.js";
import { dateToOrdinal, extractDateRange } from "./dateRange.js";
import { segmentResumeText, splitSectionEntries } from "./resumeSections.js";

export const RESUME_FACTS_EXTRACTOR_VERSION = "1.0.0";

/** @typedef {"education" | "internship" | "project" | "campus" | "skill" | "certification" | "achievement"} FactCategory */
/** @typedef {"pdf" | "docx" | "txt" | "paste" | "manual"} ResumeFormat */
/** @typedef {{ documentId: string, startOffset: number, endOffset: number, page: number | null, section: string | null }} SourceRef */
/** @typedef {{ id: string, type: "name" | "phone" | "email" | "address" | "id_number" | "other", maskedValue: string, sourceRefs: SourceRef[], confidence: "high" | "medium" | "low", reviewStatus: "detected" | "confirmed" | "dismissed" }} PrivateField */
/** @typedef {{ category: FactCategory, heading: string | null, headingStart: number | null, startOffset: number, endOffset: number, source: "heading" | "inferred" }} ExtractSection */
/** @typedef {{ factId: string, category: FactCategory, dateRange: { start: { value: string | null, precision: "year" | "month" | "day" | "unknown" } | null, end: { value: string | null, precision: "year" | "month" | "day" | "unknown" } | null, ongoing: boolean } | null, invalidDateCount: number }} TimelineMeta */
/** @typedef {{ text: string, documentId: string, format: ResumeFormat, characterCount?: number, pages?: { pageNumber: number, text: string }[], privateFields?: PrivateField[], now?: string }} ResumeExtractionInput */

const DEGREE_PATTERN = /博士|硕士|研究生|本科|学士|大专|专科|高中|ph\.?d|doctor|master|bachelor|associate/iu;
const SCHOOL_PATTERN = /大学|学院|学校|中学|研究院|university|college|school|institute/iu;
const ORGANIZATION_PATTERN = /公司|集团|银行|事务所|研究院|研究所|中心|实验室|科技|网络|咨询|company|ltd\.?|inc\.?|bank|laboratory|institute/iu;
const ROLE_PATTERN = /实习|经理|运营|产品|工程师|开发|分析师|研究员|助理|负责人|主席|部长|干事|intern|manager|engineer|analyst|assistant|lead|director|president/iu;
const RESULT_PATTERN = /提升|增长|降低|减少|实现|完成|优化|节省|覆盖|转化|上线|落地|获得|排名|increase|improve|reduce|launch|deliver|achieve/iu;
const METHOD_PATTERN = /通过|使用|利用|基于|借助|采用|负责|主导|协助|参与|using|through|with|led|built|designed|analyzed/iu;
const CERTIFICATION_PATTERN = /证书|认证|资格|CET[- ]?[46]|雅思|托福|CPA|ACCA|PMP|certificat|license|IELTS|TOEFL/iu;
const TECHNOLOGIES = Object.freeze(["Python", "SQL", "Excel", "Figma", "Axure", "Java", "JavaScript", "TypeScript", "React", "Vue", "Tableau", "Power BI", "SPSS", "Stata", "R", "Photoshop", "Git"]);
const EXPERIENCE_CATEGORIES = new Set(["education", "internship", "project", "campus"]);

/**
 * Extracts a versioned, evidence-linked ResumeFacts document without retaining the resume body.
 * @param {ResumeExtractionInput} input
 */
export function extractResumeFacts(input) {
  validateInput(input);
  const characterCount = input.characterCount ?? input.text.replace(/\s/gu, "").length;
  const resumeFacts = createEmptyResumeFacts({
    documentId: input.documentId,
    format: input.format,
    characterCount,
    textLength: input.text.length,
    now: input.now,
  });
  resumeFacts.privateFields = clonePrivateFields(input.privateFields ?? []);

  const pageRanges = createPageRanges(input.text, input.pages ?? []);
  const sections = /** @type {ExtractSection[]} */ (segmentResumeText(input.text));
  /** @type {Record<FactCategory, number>} */
  const counters = { education: 0, internship: 0, project: 0, campus: 0, skill: 0, certification: 0, achievement: 0 };
  /** @type {TimelineMeta[]} */
  const timelineMeta = [];

  sections.forEach((section) => {
    if (section.category === "skill") {
      extractSkillFacts(input, section, pageRanges, counters).forEach((fact) => resumeFacts.facts.push(fact));
      return;
    }
    if (["certification", "achievement"].includes(section.category)) {
      extractLineFacts(input, section, pageRanges, counters).forEach(({ fact, meta }) => {
        resumeFacts.facts.push(fact);
        timelineMeta.push(meta);
      });
      return;
    }
    splitSectionEntries(input.text, section).forEach((entry) => {
      const extracted = extractExperienceFact(input, section, entry, pageRanges, counters);
      if (!extracted) return;
      resumeFacts.facts.push(extracted.fact);
      timelineMeta.push(extracted.meta);
    });
  });

  resumeFacts.timelineFlags = createTimelineFlags(timelineMeta);
  return resumeFacts;
}

/** @param {ResumeExtractionInput} input */
function validateInput(input) {
  if (!input || typeof input.text !== "string") throw new TypeError("FACTS_TEXT_INVALID");
  if (typeof input.documentId !== "string" || !input.documentId.trim()) throw new TypeError("FACTS_DOCUMENT_ID_INVALID");
  if (!RESUME_SOURCE_FORMATS.includes(input.format)) throw new TypeError("FACTS_FORMAT_INVALID");
  if (input.characterCount !== undefined && (!Number.isInteger(input.characterCount) || input.characterCount < 0 || input.characterCount > input.text.length)) throw new TypeError("FACTS_CHARACTER_COUNT_INVALID");
  if (input.privateFields !== undefined && !Array.isArray(input.privateFields)) throw new TypeError("FACTS_PRIVATE_FIELDS_INVALID");
}

/** @param {ResumeExtractionInput} input @param {ExtractSection} section @param {{ startOffset: number, endOffset: number }} entry @param {{ pageNumber: number, startOffset: number, endOffset: number }[]} pageRanges @param {Record<FactCategory, number>} counters */
function extractExperienceFact(input, section, entry, pageRanges, counters) {
  const rawText = input.text.slice(entry.startOffset, entry.endOffset);
  const safeText = redactPrivateValues(rawText, entry.startOffset, input.privateFields ?? [], input.documentId);
  const lines = cleanLines(safeText);
  if (!lines.length) return null;
  const dates = extractDateRange(rawText);
  const sourceRef = createSourceRef(input.documentId, entry, section.heading, pageRanges);
  const detailLines = lines.slice(1);
  const sentences = splitDetailSentences(detailLines);
  /** @type {Record<string, unknown>} */
  let data;
  let primaryValue = null;

  if (section.category === "education") {
    const parts = headerParts(lines[0]);
    const institution = findPart(parts, SCHOOL_PATTERN) ?? extractLabeledValue(safeText, /(?:学校|院校|institution|school)\s*[:：]\s*([^\n|｜]+)/iu);
    const degree = findMatch(safeText, DEGREE_PATTERN);
    const major = extractLabeledValue(safeText, /(?:专业|major)\s*[:：]\s*([^\n|｜,，;；]+)/iu) ?? findMajorPart(parts);
    primaryValue = institution;
    data = {
      institution,
      degree,
      major,
      dateRange: dates.dateRange,
      highlights: sentences.filter((sentence) => /GPA|绩点|排名|奖学金|主修|课程|交换|保研/iu.test(sentence)),
    };
  } else if (section.category === "internship") {
    const parts = headerParts(lines[0]);
    const organization = findPart(parts, ORGANIZATION_PATTERN) ?? firstDescriptivePart(parts, ROLE_PATTERN);
    const role = findPart(parts, ROLE_PATTERN) ?? extractLabeledValue(safeText, /(?:岗位|职位|role|position)\s*[:：]\s*([^\n|｜,，;；]+)/iu);
    primaryValue = organization ?? role;
    data = {
      organization,
      role,
      location: extractLocation(safeText),
      dateRange: dates.dateRange,
      actions: sentences.filter((sentence) => METHOD_PATTERN.test(sentence)),
      methods: sentences.filter((sentence) => METHOD_PATTERN.test(sentence)),
      results: sentences.filter((sentence) => RESULT_PATTERN.test(sentence)),
      metrics: extractMetrics(safeText),
    };
  } else if (section.category === "project") {
    const parts = headerParts(lines[0]);
    const name = cleanPrimaryLabel(firstDescriptivePart(parts, /(?:19|20)\d{2}/u) ?? lines[0], /^(?:项目名称|项目|project)\s*[:：]?\s*/iu);
    const role = extractLabeledValue(safeText, /(?:角色|职责|role)\s*[:：]\s*([^\n|｜,，;；]+)/iu) ?? findPart(parts, ROLE_PATTERN);
    primaryValue = name;
    data = {
      name,
      role,
      dateRange: dates.dateRange,
      actions: sentences.filter((sentence) => METHOD_PATTERN.test(sentence)),
      methods: sentences.filter((sentence) => METHOD_PATTERN.test(sentence)),
      results: sentences.filter((sentence) => RESULT_PATTERN.test(sentence)),
      metrics: extractMetrics(safeText),
      technologies: extractTechnologies(safeText),
    };
  } else {
    const parts = headerParts(lines[0]);
    const organization = findPart(parts, /学生会|社团|协会|志愿|团委|班级|club|association|student union/iu) ?? firstDescriptivePart(parts, ROLE_PATTERN);
    const role = findPart(parts, ROLE_PATTERN) ?? extractLabeledValue(safeText, /(?:角色|职务|role)\s*[:：]\s*([^\n|｜,，;；]+)/iu);
    primaryValue = organization ?? role;
    data = {
      organization,
      role,
      dateRange: dates.dateRange,
      actions: sentences.filter((sentence) => METHOD_PATTERN.test(sentence)),
      results: sentences.filter((sentence) => RESULT_PATTERN.test(sentence)),
    };
  }

  if (!primaryValue && lines.join("").length < 4) return null;
  counters[section.category] += 1;
  const id = factId(section.category, counters[section.category]);
  const confidence = confidenceFor(section, Boolean(primaryValue), Boolean(dates.dateRange), false);
  return {
    fact: createResumeFact({ id, category: section.category, data, sourceRefs: [sourceRef], confidence, provenance: "extracted" }),
    meta: { factId: id, category: section.category, dateRange: dates.dateRange, invalidDateCount: dates.invalidRanges.length },
  };
}

/** @param {ResumeExtractionInput} input @param {ExtractSection} section @param {{ pageNumber: number, startOffset: number, endOffset: number }[]} pageRanges @param {Record<FactCategory, number>} counters */
function extractSkillFacts(input, section, pageRanges, counters) {
  const body = input.text.slice(section.startOffset, section.endOffset);
  const rawTokens = [...body.matchAll(/[^\r\n,，、;；|｜]+/gu)];
  const seen = new Set();
  return rawTokens.flatMap((match) => {
    if (match.index === undefined) return [];
    const leading = match[0].length - match[0].trimStart().length;
    const original = match[0].trim();
    const startOffset = section.startOffset + match.index + leading;
    const safe = redactPrivateValues(original, startOffset, input.privateFields ?? [], input.documentId);
    const names = extractSkillNames(safe);
    return names.flatMap((name) => {
      const key = name.toLowerCase();
      if (seen.has(key) || !isUsefulSkill(name)) return [];
      seen.add(key);
      counters.skill += 1;
      const level = findMatch(safe, /精通|熟练|掌握|了解|expert|advanced|intermediate|basic/iu);
      const sourceRef = createSourceRef(input.documentId, { startOffset, endOffset: startOffset + original.length }, section.heading, pageRanges);
      return [createResumeFact({
        id: factId("skill", counters.skill),
        category: "skill",
        data: { name, level, keywords: [name], evidenceFactIds: [] },
        sourceRefs: [sourceRef],
        confidence: confidenceFor(section, true, false, true),
        provenance: "extracted",
      })];
    });
  });
}

/** @param {ResumeExtractionInput} input @param {ExtractSection} section @param {{ pageNumber: number, startOffset: number, endOffset: number }[]} pageRanges @param {Record<FactCategory, number>} counters */
function extractLineFacts(input, section, pageRanges, counters) {
  const body = input.text.slice(section.startOffset, section.endOffset);
  const lines = [...body.matchAll(/[^\r\n]+/gu)];
  return lines.flatMap((match) => {
    if (match.index === undefined) return [];
    const leading = match[0].length - match[0].trimStart().length;
    const startOffset = section.startOffset + match.index + leading;
    const original = match[0].trim();
    const safe = redactPrivateValues(original, startOffset, input.privateFields ?? [], input.documentId);
    if (safe.length < 2) return [];
    const dates = extractDateRange(original);
    const sourceRef = createSourceRef(input.documentId, { startOffset, endOffset: startOffset + original.length }, section.heading, pageRanges);
    counters[section.category] += 1;
    const id = factId(section.category, counters[section.category]);
    if (section.category === "certification") {
      const name = cleanPrimaryLabel(stripDateTokens(safe), /^(?:证书|认证|certification)\s*[:：]?\s*/iu);
      if (!CERTIFICATION_PATTERN.test(safe) && section.source === "inferred") return [];
      const fact = createResumeFact({
        id,
        category: "certification",
        data: { name, issuer: extractLabeledValue(safe, /(?:颁发机构|颁发方|issuer)\s*[:：]\s*([^,，;；]+)/iu), issuedAt: dates.dateRange?.start ?? null, expiresAt: dates.dateRange?.end ?? null, credentialId: extractLabeledValue(safe, /(?:证书编号|credential id)\s*[:：]\s*([^,，;；]+)/iu) },
        sourceRefs: [sourceRef], confidence: confidenceFor(section, Boolean(name), Boolean(dates.dateRange), true), provenance: "extracted",
      });
      return [{ fact, meta: { factId: id, category: /** @type {FactCategory} */ ("certification"), dateRange: dates.dateRange, invalidDateCount: dates.invalidRanges.length } }];
    }
    const title = cleanPrimaryLabel(stripDateTokens(safe), /^(?:获奖经历|奖项|荣誉|成果|award|honor)\s*[:：]?\s*/iu);
    const fact = createResumeFact({
      id,
      category: "achievement",
      data: { title, issuer: extractLabeledValue(safe, /(?:颁发机构|颁发方|issuer)\s*[:：]\s*([^,，;；]+)/iu), receivedAt: dates.dateRange?.start ?? null, level: findMatch(safe, /国家级|省级|市级|校级|院级|一等奖|二等奖|三等奖|national|provincial|university/iu), description: null },
      sourceRefs: [sourceRef], confidence: confidenceFor(section, Boolean(title), Boolean(dates.dateRange), true), provenance: "extracted",
    });
    return [{ fact, meta: { factId: id, category: /** @type {FactCategory} */ ("achievement"), dateRange: dates.dateRange, invalidDateCount: dates.invalidRanges.length } }];
  });
}

/** @param {TimelineMeta[]} meta */
function createTimelineFlags(meta) {
  /** @type {{ id: string, type: "date_overlap" | "date_invalid" | "date_missing" | "date_conflict", factIds: string[], status: "open", messageKey: string }[]} */
  const flags = [];
  /** @type {Record<"date_overlap" | "date_invalid" | "date_missing" | "date_conflict", number>} */
  const counters = { date_overlap: 0, date_invalid: 0, date_missing: 0, date_conflict: 0 };
  /** @param {"date_overlap" | "date_invalid" | "date_missing" | "date_conflict"} type @param {string[]} factIds */
  const add = (type, factIds) => {
    counters[type] += 1;
    flags.push({ id: `timeline-${type}-${String(counters[type]).padStart(3, "0")}`, type, factIds, status: "open", messageKey: `resume.timeline.${type}` });
  };

  meta.forEach((item) => {
    if (item.invalidDateCount) add("date_invalid", [item.factId]);
    if (EXPERIENCE_CATEGORIES.has(item.category) && !item.dateRange && !item.invalidDateCount) add("date_missing", [item.factId]);
    const start = dateToOrdinal(item.dateRange?.start ?? null, "start");
    const end = dateToOrdinal(item.dateRange?.end ?? null, "end");
    if (start !== null && end !== null && start > end) add("date_conflict", [item.factId]);
  });

  for (const category of ["education", "internship"]) {
    const comparable = meta.filter((item) => item.category === category && item.dateRange?.start && (item.dateRange.end || item.dateRange.ongoing));
    for (let leftIndex = 0; leftIndex < comparable.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < comparable.length; rightIndex += 1) {
        const left = comparable[leftIndex];
        const right = comparable[rightIndex];
        if (rangesOverlap(left.dateRange, right.dateRange)) add("date_overlap", [left.factId, right.factId]);
      }
    }
  }
  return flags;
}

/** @param {TimelineMeta["dateRange"]} left @param {TimelineMeta["dateRange"]} right */
function rangesOverlap(left, right) {
  const leftStart = dateToOrdinal(left?.start ?? null, "start");
  const rightStart = dateToOrdinal(right?.start ?? null, "start");
  const leftEnd = left?.ongoing ? Number.POSITIVE_INFINITY : dateToOrdinal(left?.end ?? null, "end");
  const rightEnd = right?.ongoing ? Number.POSITIVE_INFINITY : dateToOrdinal(right?.end ?? null, "end");
  if (leftStart === null || rightStart === null || leftEnd === null || rightEnd === null) return false;
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

/** @param {ExtractSection} section @param {boolean} hasPrimary @param {boolean} hasDate @param {boolean} exactItem */
function confidenceFor(section, hasPrimary, hasDate, exactItem) {
  let score = section.source === "heading" ? 0.55 : 0.35;
  /** @type {string[]} */
  const reasons = [section.source === "heading" ? "section_heading" : "section_inferred"];
  if (hasPrimary) { score += 0.2; reasons.push("primary_field_detected"); }
  if (hasDate) { score += 0.15; reasons.push("date_range_detected"); }
  if (exactItem) { score += 0.1; reasons.push("item_boundary_detected"); }
  score = Math.min(0.98, Number(score.toFixed(2)));
  return { level: /** @type {"high" | "medium" | "low"} */ (score >= 0.8 ? "high" : score >= 0.58 ? "medium" : "low"), score, reasons };
}

/** @param {string} documentId @param {{ startOffset: number, endOffset: number }} range @param {string | null} section @param {{ pageNumber: number, startOffset: number, endOffset: number }[]} pageRanges */
function createSourceRef(documentId, range, section, pageRanges) {
  const page = pageRanges.find((candidate) => range.startOffset < candidate.endOffset && range.endOffset > candidate.startOffset)?.pageNumber ?? null;
  return { documentId, startOffset: range.startOffset, endOffset: range.endOffset, page, section };
}

/** @param {string} text @param {{ pageNumber: number, text: string }[]} pages */
function createPageRanges(text, pages) {
  /** @type {{ pageNumber: number, startOffset: number, endOffset: number }[]} */
  const ranges = [];
  let cursor = 0;
  pages.forEach((page) => {
    if (!page || !Number.isInteger(page.pageNumber) || typeof page.text !== "string" || !page.text) return;
    const startOffset = text.indexOf(page.text, cursor);
    if (startOffset < 0) return;
    ranges.push({ pageNumber: page.pageNumber, startOffset, endOffset: startOffset + page.text.length });
    cursor = startOffset + page.text.length;
  });
  return ranges;
}

/** @param {PrivateField[]} fields */
function clonePrivateFields(fields) {
  return fields.map((field) => ({ ...field, sourceRefs: field.sourceRefs.map((sourceRef) => ({ ...sourceRef })) }));
}

/** @param {string} text @param {number} baseOffset @param {PrivateField[]} fields @param {string} documentId */
function redactPrivateValues(text, baseOffset, fields, documentId) {
  const replacements = fields.flatMap((field) => field.reviewStatus === "dismissed" ? [] : field.sourceRefs
    .filter((ref) => ref.documentId === documentId && ref.startOffset < baseOffset + text.length && ref.endOffset > baseOffset)
    .map((ref) => ({ start: Math.max(0, ref.startOffset - baseOffset), end: Math.min(text.length, ref.endOffset - baseOffset), value: field.maskedValue })))
    .sort((left, right) => right.start - left.start);
  return replacements.reduce((safe, replacement) => `${safe.slice(0, replacement.start)}${replacement.value}${safe.slice(replacement.end)}`, text);
}

/** @param {string} text */
function cleanLines(text) {
  return text.split(/\r?\n/gu).map((line) => line.trim().replace(/^[•·▪◦*+-]\s*/u, "")).filter(Boolean);
}

/** @param {string} line */
function headerParts(line) {
  return line.split(/\s{2,}|[|｜\t]/gu).map((part) => stripDateTokens(part).trim()).filter(Boolean);
}

/** @param {string[]} parts @param {RegExp} pattern */
function findPart(parts, pattern) {
  return parts.find((part) => pattern.test(part)) ?? null;
}

/** @param {string[]} parts @param {RegExp} excluded */
function firstDescriptivePart(parts, excluded) {
  return parts.find((part) => !excluded.test(part) && part.length >= 2 && part.length <= 80) ?? null;
}

/** @param {string[]} parts */
function findMajorPart(parts) {
  return parts.find((part) => !SCHOOL_PATTERN.test(part) && !DEGREE_PATTERN.test(part) && /专业|工程|管理|经济|金融|计算机|法学|文学|设计|新闻|统计|数学|science|engineering|management|economics|finance/iu.test(part))?.replace(/专业$/u, "") ?? null;
}

/** @param {string} text @param {RegExp} pattern */
function extractLabeledValue(text, pattern) {
  return text.match(pattern)?.[1]?.trim() ?? null;
}

/** @param {string} text @param {RegExp} pattern */
function findMatch(text, pattern) {
  return text.match(pattern)?.[0] ?? null;
}

/** @param {string} text */
function extractLocation(text) {
  return extractLabeledValue(text, /(?:地点|城市|location)\s*[:：]\s*([^\n|｜,，;；]+)/iu)
    ?? text.match(/(?:北京|上海|广州|深圳|杭州|南京|成都|武汉|苏州|西安|重庆|天津|长沙|厦门|宁波)/u)?.[0]
    ?? null;
}

/** @param {string[]} detailLines */
function splitDetailSentences(detailLines) {
  return detailLines.flatMap((line) => line.split(/[。；;]/gu)).map((sentence) => sentence.trim()).filter((sentence) => sentence.length >= 2);
}

/** @param {string} text */
function extractMetrics(text) {
  return [...new Set([...text.matchAll(/(?:\d+(?:\.\d+)?\s*(?:%|％|万|千|百|人|次|个|项|家|天|小时|元|万元|倍|条|份|场|组))/gu)].map((match) => match[0].replace(/\s/gu, "")))];
}

/** @param {string} text */
function extractTechnologies(text) {
  return TECHNOLOGIES.filter((technology) => new RegExp(`(?:^|[^A-Za-z])${escapeRegExp(technology)}(?:$|[^A-Za-z])`, "iu").test(text));
}

/** @param {string} token */
function extractSkillNames(token) {
  const technologies = extractTechnologies(token);
  if (technologies.length) return technologies;
  const cleaned = token.replace(/^(?:熟练使用|熟练掌握|掌握|熟悉|了解|精通|技能|skills?)\s*[:：]?\s*/iu, "").replace(/\s*[（(](?:熟练|掌握|了解|精通|advanced|basic)[）)]$/iu, "").trim();
  return cleaned ? [cleaned] : [];
}

/** @param {string} name */
function isUsefulSkill(name) {
  return name.length >= 1 && name.length <= 40 && !/@|电话|手机|地址|姓名|身份证/iu.test(name) && !/^(?:无|暂无|熟练|掌握|了解|精通)$/u.test(name);
}

/** @param {string} value */
function stripDateTokens(value) {
  return value.replace(/(?<!\d)(?:19|20)\d{2}(?:(?:(?:\s*年\s*)|[./-])\d{1,2}(?:(?:(?:\s*月\s*)|[./-])\d{1,2}\s*日?)?\s*月?|\s*年)?(?!\d)/gu, "").replace(/\s*(?:[-—–~至到]|present|current|至今)\s*/giu, " ").trim();
}

/** @param {string} value @param {RegExp} labelPattern */
function cleanPrimaryLabel(value, labelPattern) {
  const cleaned = value.replace(labelPattern, "").replace(/^[|｜:：,，;；\s]+|[|｜:：,，;；\s]+$/gu, "").trim();
  return cleaned || null;
}

/** @param {FactCategory} category @param {number} index */
function factId(category, index) {
  return `fact-${category}-${String(index).padStart(3, "0")}`;
}

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
