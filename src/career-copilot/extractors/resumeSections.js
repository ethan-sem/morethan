export const RESUME_SECTION_RULES_VERSION = "1.0.0";

/** @typedef {"education" | "internship" | "project" | "campus" | "skill" | "certification" | "achievement"} SectionCategory */
/** @typedef {{ category: SectionCategory, heading: string | null, headingStart: number | null, startOffset: number, endOffset: number, source: "heading" | "inferred" }} ResumeSection */
/** @typedef {{ startOffset: number, endOffset: number }} ResumeEntryRange */

const SECTION_RULES = Object.freeze([
  { category: "education", pattern: /^(?:教育经历|教育背景|学历背景|education(?:al background)?)$/iu },
  { category: "internship", pattern: /^(?:实习经历|工作经历|工作经验|职业经历|internships?|work experience|experience)$/iu },
  { category: "project", pattern: /^(?:项目经历|项目经验|研究经历|projects?|project experience|research experience)$/iu },
  { category: "campus", pattern: /^(?:校园经历|学生工作|社团经历|志愿经历|campus experience|activities|leadership)$/iu },
  { category: "skill", pattern: /^(?:专业技能|技能特长|技能|skills?|technical skills)$/iu },
  { category: "certification", pattern: /^(?:证书|资格证书|专业认证|certifications?|licenses?)$/iu },
  { category: "achievement", pattern: /^(?:获奖经历|荣誉奖项|奖项|荣誉|成果|awards?|honors?|achievements?)$/iu },
]);

/** @param {string} text @returns {ResumeSection[]} */
export function segmentResumeText(text) {
  if (typeof text !== "string") throw new TypeError("SECTION_TEXT_INVALID");
  const lines = collectLines(text);
  const headings = lines.map((line) => ({ ...line, category: classifyHeading(line.value) })).filter((line) => line.category);
  if (!headings.length) return inferSections(text);

  return headings.map((heading, index) => {
    const nextHeading = headings[index + 1];
    const rawStart = heading.endOffset;
    const rawEnd = nextHeading?.startOffset ?? text.length;
    const range = trimRange(text, rawStart, rawEnd);
    return {
      category: /** @type {SectionCategory} */ (heading.category),
      heading: normalizeHeading(heading.value),
      headingStart: heading.startOffset,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      source: /** @type {"heading"} */ ("heading"),
    };
  }).filter((section) => section.endOffset > section.startOffset);
}

/** @param {string} text @param {ResumeSection} section @returns {ResumeEntryRange[]} */
export function splitSectionEntries(text, section) {
  const range = trimRange(text, section.startOffset, section.endOffset);
  if (range.endOffset <= range.startOffset) return [];
  const body = text.slice(range.startOffset, range.endOffset);
  const blankSeparated = collectNonBlankBlocks(body, range.startOffset);
  if (blankSeparated.length > 1) return blankSeparated;

  const lines = collectLines(body, range.startOffset).filter((line) => line.value.trim());
  if (lines.length <= 1 || ["skill", "certification", "achievement"].includes(section.category)) {
    return lines.length ? [{ startOffset: range.startOffset, endOffset: range.endOffset }] : [];
  }

  /** @type {ResumeEntryRange[]} */
  const entries = [];
  let currentStart = lines[0].startOffset;
  let currentHasDate = hasDateHint(lines[0].value);
  lines.slice(1).forEach((line) => {
    const lineHasDate = hasDateHint(line.value);
    const startsNewEntry = currentHasDate && !/^[•·▪◦*+-]/u.test(line.value.trim()) && (lineHasDate || looksLikeEntryHeader(line.value));
    if (startsNewEntry) {
      const previous = trimRange(text, currentStart, line.startOffset);
      if (previous.endOffset > previous.startOffset) entries.push(previous);
      currentStart = line.startOffset;
      currentHasDate = true;
    } else if (lineHasDate) currentHasDate = true;
  });
  const last = trimRange(text, currentStart, range.endOffset);
  if (last.endOffset > last.startOffset) entries.push(last);
  return entries;
}

/** @param {string} line @returns {SectionCategory | null} */
export function classifyHeading(line) {
  const normalized = normalizeHeading(line);
  return /** @type {SectionCategory | null} */ (SECTION_RULES.find((rule) => rule.pattern.test(normalized))?.category ?? null);
}

/** @param {string} value */
function normalizeHeading(value) {
  return value.trim().replace(/^(?:[#>*•·▪◦-]|\d+[.)、])\s*/u, "").replace(/[：:]$/u, "").trim();
}

/** @param {string} text @param {number} [baseOffset] */
function collectLines(text, baseOffset = 0) {
  /** @type {{ value: string, startOffset: number, endOffset: number }[]} */
  const lines = [];
  const pattern = /[^\r\n]*(?:\r\n|\r|\n|$)/gu;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || !match[0]) continue;
    const value = match[0].replace(/[\r\n]+$/u, "");
    lines.push({ value, startOffset: baseOffset + match.index, endOffset: baseOffset + match.index + match[0].length });
  }
  return lines;
}

/** @param {string} text @returns {ResumeSection[]} */
function inferSections(text) {
  return collectNonBlankBlocks(text, 0).map((range) => {
    const category = inferCategory(text.slice(range.startOffset, range.endOffset));
    return category ? { category, heading: null, headingStart: null, ...range, source: /** @type {"inferred"} */ ("inferred") } : null;
  }).filter((section) => section !== null);
}

/** @param {string} block @returns {SectionCategory | null} */
function inferCategory(block) {
  const rules = /** @type {[SectionCategory, RegExp][]} */ ([
    ["education", /大学|学院|本科|硕士|博士|学士|university|college|bachelor|master/iu],
    ["project", /项目|课题|project|research/iu],
    ["campus", /学生会|社团|志愿|班长|团委|campus|volunteer/iu],
    ["certification", /证书|认证|资格|CET[- ]?[46]|雅思|托福|certificat|license/iu],
    ["achievement", /获奖|奖学金|荣誉|一等奖|二等奖|三等奖|award|honor/iu],
    ["internship", /实习|公司|集团|银行|事务所|intern|company|ltd\.?|inc\.?/iu],
    ["skill", /技能|熟练|掌握|擅长|skills?|python|sql|excel|figma|axure/iu],
  ]);
  return /** @type {SectionCategory | null} */ (rules.find(([, pattern]) => pattern.test(block))?.[0] ?? null);
}

/** @param {string} text @param {number} baseOffset */
function collectNonBlankBlocks(text, baseOffset) {
  /** @type {ResumeEntryRange[]} */
  const blocks = [];
  const pattern = /\S[\s\S]*?(?=(?:\r?\n){2,}|$)/gu;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const range = trimRange(text, match.index, match.index + match[0].length);
    if (range.endOffset > range.startOffset) blocks.push({ startOffset: baseOffset + range.startOffset, endOffset: baseOffset + range.endOffset });
  }
  return blocks;
}

/** @param {string} text @param {number} startOffset @param {number} endOffset */
function trimRange(text, startOffset, endOffset) {
  let start = startOffset;
  let end = endOffset;
  while (start < end && /\s/u.test(text[start])) start += 1;
  while (end > start && /\s/u.test(text[end - 1])) end -= 1;
  return { startOffset: start, endOffset: end };
}

/** @param {string} value */
function hasDateHint(value) {
  return /(?:19|20)\d{2}/u.test(value);
}

/** @param {string} value */
function looksLikeEntryHeader(value) {
  return /[|｜\t]/u.test(value) && /公司|集团|银行|事务所|学生会|社团|协会|大学|学院|实习|经理|运营|产品|工程师|分析师|助理|负责人|company|university|intern|manager|engineer|analyst/iu.test(value);
}
