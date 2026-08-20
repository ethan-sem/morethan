export const PII_DETECTOR_VERSION = "1.0.0";

/** @typedef {"name" | "phone" | "email" | "address" | "id_number" | "other"} PrivateFieldType */
/** @typedef {"high" | "medium" | "low"} PrivateFieldConfidence */
/** @typedef {{ documentId: string, startOffset: number, endOffset: number, page: number | null, section: string | null }} PrivateSourceRef */
/** @typedef {{ id: string, type: PrivateFieldType, maskedValue: string, sourceRefs: PrivateSourceRef[], confidence: PrivateFieldConfidence, reviewStatus: "detected" | "confirmed" | "dismissed" }} PrivateField */
/** @typedef {{ type: PrivateFieldType, startOffset: number, endOffset: number, maskedValue: string, confidence: PrivateFieldConfidence, priority: number }} DetectionCandidate */

const EMAIL_PATTERN = /(?<![A-Z0-9._%+-])[A-Z0-9][A-Z0-9._%+-]{0,63}@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+(?![A-Z0-9.-])/giu;
const MOBILE_PATTERN = /(?<!\d)(?:(?:\+?86)[ -]?)?1[3-9]\d(?:[ -]?\d){8}(?!\d)/gu;
const LANDLINE_PATTERN = /(?<!\d)0\d{2,3}[ -]?\d{7,8}(?!\d)/gu;
const ID_NUMBER_PATTERN = /(?<![\dX])(?:\d{17}[\dX]|\d{15})(?![\dX])/giu;
const LABELED_NAME_PATTERN = /(^|[\s|｜,，;；])(?:姓名|name)\s*[:：]\s*([\p{Script=Han}·]{2,6}|[A-Z][A-Z'.-]*(?:[ \t]+[A-Z][A-Z'.-]*){0,3})/gimu;
const LABELED_ADDRESS_PATTERN = /(^|[\r\n])([ \t]*(?:详细地址|通讯地址|家庭住址|现居地址|现居地|居住地址|住址|地址|address)\s*[:：]\s*)([^\r\n|｜;；]{1,120})/gimu;
const NEXT_FIELD_PATTERN = /\s+(?=(?:姓名|电话|手机|联系方式|邮箱|e-?mail|性别|出生年月|求职意向)\s*[:：])/iu;
const ADDRESS_SIGNAL_PATTERN = /[省市区县旗镇乡街路巷弄道号室栋幢单元村小区园公寓]/gu;
const HEADER_NAME_EXCLUSIONS = new Set(["个人简历", "求职简历", "简历", "个人信息", "基本信息", "联系方式", "教育经历", "实习经历", "项目经历", "resume", "curriculum vitae", "personal information", "contact information"]);

const TYPE_PRIORITY = Object.freeze({ address: 500, id_number: 400, email: 300, phone: 200, name: 100, other: 0 });

/**
 * Detects sensitive fields locally and returns ResumeFacts-compatible records.
 * Raw values are used only inside this call and are never included in the result.
 * @param {string} text
 * @param {{ documentId: string }} options
 * @returns {PrivateField[]}
 */
export function detectPrivateFields(text, options) {
  if (typeof text !== "string") throw new TypeError("PII_TEXT_INVALID");
  if (!options || typeof options.documentId !== "string" || !options.documentId.trim()) throw new TypeError("PII_DOCUMENT_ID_INVALID");
  if (!text) return [];

  /** @type {DetectionCandidate[]} */
  const candidates = [];
  collectAddresses(text, candidates);
  collectIdNumbers(text, candidates);
  collectEmails(text, candidates);
  collectPhones(text, candidates);
  collectLabeledNames(text, candidates);
  collectHeaderName(text, candidates);

  return resolveCandidateOverlaps(candidates).map((candidate) => ({
    id: `private-${candidate.type}-${candidate.startOffset}-${candidate.endOffset}`,
    type: candidate.type,
    maskedValue: candidate.maskedValue,
    sourceRefs: [{
      documentId: options.documentId,
      startOffset: candidate.startOffset,
      endOffset: candidate.endOffset,
      page: null,
      section: null,
    }],
    confidence: candidate.confidence,
    reviewStatus: "detected",
  }));
}

/**
 * Applies non-dismissed private-field masks without requiring or retaining raw values in the records.
 * @param {string} text
 * @param {PrivateField[]} privateFields
 * @param {{ documentId?: string }} [options]
 */
export function maskPrivateFieldsInText(text, privateFields, options = {}) {
  if (typeof text !== "string") throw new TypeError("PII_TEXT_INVALID");
  if (!Array.isArray(privateFields)) throw new TypeError("PII_FIELDS_INVALID");
  /** @type {{ startOffset: number, endOffset: number, maskedValue: string }[]} */
  const replacements = [];

  privateFields.forEach((field) => {
    if (!field || field.reviewStatus === "dismissed" || typeof field.maskedValue !== "string" || !Array.isArray(field.sourceRefs)) return;
    field.sourceRefs.forEach((sourceRef) => {
      if (options.documentId && sourceRef.documentId !== options.documentId) return;
      if (!Number.isInteger(sourceRef.startOffset) || !Number.isInteger(sourceRef.endOffset) || sourceRef.startOffset < 0 || sourceRef.endOffset > text.length || sourceRef.endOffset <= sourceRef.startOffset) return;
      replacements.push({ startOffset: sourceRef.startOffset, endOffset: sourceRef.endOffset, maskedValue: field.maskedValue });
    });
  });

  const nonOverlapping = resolveReplacements(replacements).sort((left, right) => right.startOffset - left.startOffset);
  return nonOverlapping.reduce(
    (maskedText, replacement) => `${maskedText.slice(0, replacement.startOffset)}${replacement.maskedValue}${maskedText.slice(replacement.endOffset)}`,
    text,
  );
}

/** @param {string} text @param {DetectionCandidate[]} candidates */
function collectEmails(text, candidates) {
  for (const match of text.matchAll(EMAIL_PATTERN)) {
    if (match.index === undefined) continue;
    const value = match[0];
    const at = value.lastIndexOf("@");
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);
    addCandidate(candidates, "email", match.index, match.index + value.length, `${local.slice(0, 1)}***@${domain}`, "high");
  }
}

/** @param {string} text @param {DetectionCandidate[]} candidates */
function collectPhones(text, candidates) {
  for (const pattern of [MOBILE_PATTERN, LANDLINE_PATTERN]) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const digits = match[0].replace(/\D/gu, "");
      const normalized = digits.length === 13 && digits.startsWith("86") ? digits.slice(2) : digits;
      const isMobile = /^1[3-9]\d{9}$/u.test(normalized);
      const maskedValue = isMobile
        ? `${normalized.slice(0, 3)}****${normalized.slice(-4)}`
        : `${normalized.slice(0, normalized.length - 8)}-****${normalized.slice(-4)}`;
      addCandidate(candidates, "phone", match.index, match.index + match[0].length, maskedValue, "high");
    }
  }
}

/** @param {string} text @param {DetectionCandidate[]} candidates */
function collectIdNumbers(text, candidates) {
  for (const match of text.matchAll(ID_NUMBER_PATTERN)) {
    if (match.index === undefined || !isValidChineseIdNumber(match[0])) continue;
    addCandidate(candidates, "id_number", match.index, match.index + match[0].length, `${match[0].slice(0, 3)}***********${match[0].slice(-4)}`, "high");
  }
}

/** @param {string} text @param {DetectionCandidate[]} candidates */
function collectLabeledNames(text, candidates) {
  for (const match of text.matchAll(LABELED_NAME_PATTERN)) {
    if (match.index === undefined) continue;
    const value = match[2].trim();
    if (!isPlausibleName(value)) continue;
    const relativeStart = match[0].lastIndexOf(match[2]);
    const startOffset = match.index + relativeStart;
    addCandidate(candidates, "name", startOffset, startOffset + match[2].length, maskName(value), "high");
  }
}

/** @param {string} text @param {DetectionCandidate[]} candidates */
function collectHeaderName(text, candidates) {
  const contactNearHeader = candidates.some((candidate) => ["email", "phone"].includes(candidate.type) && candidate.startOffset < 320);
  if (!contactNearHeader) return;
  const lines = [...text.matchAll(/[^\r\n]+/gu)]
    .slice(0, 4)
    .map((match) => ({ raw: match[0], startOffset: match.index ?? 0, value: match[0].trim() }))
    .filter((line) => line.value);
  const first = lines[0];
  if (!first || !isPlausibleName(first.value) || HEADER_NAME_EXCLUSIONS.has(first.value.toLowerCase())) return;
  const leadingWhitespace = first.raw.length - first.raw.trimStart().length;
  const startOffset = first.startOffset + leadingWhitespace;
  addCandidate(candidates, "name", startOffset, startOffset + first.value.length, maskName(first.value), "medium");
}

/** @param {string} text @param {DetectionCandidate[]} candidates */
function collectAddresses(text, candidates) {
  for (const match of text.matchAll(LABELED_ADDRESS_PATTERN)) {
    if (match.index === undefined) continue;
    const captured = match[3];
    const nextFieldIndex = captured.search(NEXT_FIELD_PATTERN);
    const bounded = (nextFieldIndex >= 0 ? captured.slice(0, nextFieldIndex) : captured).trimEnd();
    const leadingWhitespace = bounded.length - bounded.trimStart().length;
    const value = bounded.trim();
    if (!isDetailedAddress(value)) continue;
    const capturedStart = match.index + match[1].length + match[2].length;
    const startOffset = capturedStart + leadingWhitespace;
    addCandidate(candidates, "address", startOffset, startOffset + value.length, "[详细地址已隐藏]", "high");
  }
}

/** @param {DetectionCandidate[]} candidates @param {PrivateFieldType} type @param {number} startOffset @param {number} endOffset @param {string} maskedValue @param {PrivateFieldConfidence} confidence */
function addCandidate(candidates, type, startOffset, endOffset, maskedValue, confidence) {
  candidates.push({ type, startOffset, endOffset, maskedValue, confidence, priority: TYPE_PRIORITY[type] });
}

/** @param {DetectionCandidate[]} candidates */
function resolveCandidateOverlaps(candidates) {
  /** @type {DetectionCandidate[]} */
  const accepted = [];
  const ranked = [...candidates].sort((left, right) => right.priority - left.priority || (right.endOffset - right.startOffset) - (left.endOffset - left.startOffset) || left.startOffset - right.startOffset);
  ranked.forEach((candidate) => {
    const duplicatesOrOverlaps = accepted.some((current) => candidate.startOffset < current.endOffset && candidate.endOffset > current.startOffset);
    if (!duplicatesOrOverlaps) accepted.push(candidate);
  });
  return accepted.sort((left, right) => left.startOffset - right.startOffset || right.priority - left.priority);
}

/** @param {{ startOffset: number, endOffset: number, maskedValue: string }[]} replacements */
function resolveReplacements(replacements) {
  /** @type {typeof replacements} */
  const accepted = [];
  [...replacements]
    .sort((left, right) => left.startOffset - right.startOffset || right.endOffset - left.endOffset)
    .forEach((candidate) => {
      if (!accepted.some((current) => candidate.startOffset < current.endOffset && candidate.endOffset > current.startOffset)) accepted.push(candidate);
    });
  return accepted;
}

/** @param {string} value */
function isPlausibleName(value) {
  if (HEADER_NAME_EXCLUSIONS.has(value.toLowerCase())) return false;
  return /^[\p{Script=Han}·]{2,6}$/u.test(value) || /^[A-Z][A-Z'.-]*(?:[ \t]+[A-Z][A-Z'.-]*){0,3}$/iu.test(value);
}

/** @param {string} value */
function maskName(value) {
  return /^[\p{Script=Han}·]+$/u.test(value) ? `${value.slice(0, 1)}**` : `${value.slice(0, 1).toUpperCase()}***`;
}

/** @param {string} value */
function isDetailedAddress(value) {
  if (value.length < 6 || value.length > 100) return false;
  const signals = value.match(ADDRESS_SIGNAL_PATTERN)?.length ?? 0;
  return signals >= 2
    || /(?:路|街|道|巷|弄).{0,20}\d+(?:号|室|栋|幢|单元)/u.test(value)
    || /\d+.{0,30}\b(?:street|road|avenue|lane|district|building|room)\b/iu.test(value);
}

/** @param {string} value */
function isValidChineseIdNumber(value) {
  const normalized = value.toUpperCase();
  const birth = normalized.length === 18 ? normalized.slice(6, 14) : `19${normalized.slice(6, 12)}`;
  if (!isValidDateToken(birth)) return false;
  if (normalized.length === 15) return true;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = "10X98765432";
  const sum = normalized.slice(0, 17).split("").reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
  return checks[sum % 11] === normalized[17];
}

/** @param {string} value */
function isValidDateToken(value) {
  if (!/^\d{8}$/u.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= new Date().getUTCFullYear() && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
