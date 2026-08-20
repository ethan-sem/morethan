export const DATE_RULES_VERSION = "1.0.0";

/** @typedef {{ value: string | null, precision: "year" | "month" | "day" | "unknown" }} NormalizedDate */
/** @typedef {{ start: NormalizedDate | null, end: NormalizedDate | null, ongoing: boolean }} ResumeDateRange */
/** @typedef {{ startOffset: number, endOffset: number }} InvalidDateRange */

const DATE_TOKEN_PATTERN = /(?<!\d)(?:19|20)\d{2}(?:(?:(?:\s*年\s*)|[./-])\d{1,2}(?:(?:(?:\s*月\s*)|[./-])\d{1,2}\s*日?)?\s*月?|\s*年)?(?!\d)/gu;
const ONGOING_PATTERN = /至今|现在|目前|今|present|current|now/iu;

/**
 * Parses the first chronological range in a fact block and reports invalid date-shaped ranges separately.
 * @param {string} text
 * @returns {{ dateRange: ResumeDateRange | null, invalidRanges: InvalidDateRange[] }}
 */
export function extractDateRange(text) {
  if (typeof text !== "string") throw new TypeError("DATE_TEXT_INVALID");
  /** @type {{ date: NormalizedDate, startOffset: number, endOffset: number }[]} */
  const validTokens = [];
  /** @type {InvalidDateRange[]} */
  const invalidRanges = [];

  for (const match of text.matchAll(DATE_TOKEN_PATTERN)) {
    if (match.index === undefined) continue;
    const parsed = normalizeDateToken(match[0]);
    const range = { startOffset: match.index, endOffset: match.index + match[0].length };
    if (parsed) validTokens.push({ date: parsed, ...range });
    else invalidRanges.push(range);
  }

  const ongoing = ONGOING_PATTERN.test(text);
  const start = validTokens[0]?.date ?? null;
  const end = ongoing ? null : validTokens[1]?.date ?? null;
  return {
    dateRange: start || end ? { start, end, ongoing } : null,
    invalidRanges,
  };
}

/** @param {string} token @returns {NormalizedDate | null} */
export function normalizeDateToken(token) {
  if (typeof token !== "string") return null;
  const parts = token.match(/\d+/gu)?.map(Number) ?? [];
  if (!parts.length) return null;
  const [year, month, day] = parts;
  if (year < 1900 || year > 2099) return null;
  if (month === undefined) return { value: String(year), precision: "year" };
  if (month < 1 || month > 12) return null;
  if (day === undefined) return { value: `${year}-${String(month).padStart(2, "0")}`, precision: "month" };
  if (!isValidCalendarDay(year, month, day)) return null;
  return { value: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, precision: "day" };
}

/** @param {NormalizedDate | null} date @param {"start" | "end"} boundary */
export function dateToOrdinal(date, boundary) {
  if (!date || !date.value) return null;
  const [year, month = boundary === "start" ? 1 : 12, day = boundary === "start" ? 1 : daysInMonth(Number(year), Number(month))] = date.value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** @param {number} year @param {number} month @param {number} day */
function isValidCalendarDay(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** @param {number} year @param {number} month */
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
