import { isFlowStep } from "../domain/flow.js";

export const CAREER_PERSISTENCE_POLICY_VERSION = "1.0.0";
export const CAREER_FLOW_STORAGE_KEY = "morethan-career-copilot-flow-v1";

export const CAREER_PERSISTENCE_ALLOWLIST = Object.freeze({
  sessionStorage: Object.freeze([CAREER_FLOW_STORAGE_KEY]),
  localStorage: Object.freeze([]),
  indexedDB: Object.freeze([]),
  cacheStorage: Object.freeze([]),
  cookies: Object.freeze([]),
});

const FLOW_FIELDS = Object.freeze(["version", "step", "visited"]);

/** @param {string} area @param {string} key @param {string} value */
export function validateCareerPersistenceEntry(area, key, value) {
  if (!(area in CAREER_PERSISTENCE_ALLOWLIST)) return { valid: false, code: "AREA_FORBIDDEN" };
  const allowedKeys = CAREER_PERSISTENCE_ALLOWLIST[/** @type {keyof typeof CAREER_PERSISTENCE_ALLOWLIST} */ (area)];
  if (!allowedKeys.includes(/** @type {never} */ (key))) return { valid: false, code: "KEY_FORBIDDEN" };
  if (area !== "sessionStorage" || key !== CAREER_FLOW_STORAGE_KEY) return { valid: false, code: "ENTRY_FORBIDDEN" };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { valid: false, code: "FLOW_PAYLOAD_INVALID" };
    if (Object.keys(parsed).some((field) => !FLOW_FIELDS.includes(field))) return { valid: false, code: "FLOW_FIELD_FORBIDDEN" };
    if (parsed.version !== 1 || !isFlowStep(parsed.step) || !Array.isArray(parsed.visited) || parsed.visited.some(/** @param {unknown} step */ (step) => typeof step !== "string" || !isFlowStep(step))) return { valid: false, code: "FLOW_PAYLOAD_INVALID" };
    return { valid: true, code: null };
  } catch {
    return { valid: false, code: "FLOW_JSON_INVALID" };
  }
}

/**
 * Audits all durable browser surfaces. Sensitive values are supplied by the
 * current in-memory session and compared without logging their contents.
 * @param {{ sessionStorage?: Storage, localStorage?: Storage, caches?: CacheStorage, indexedDB?: IDBFactory, document?: Document, url?: string, sensitiveValues?: string[] }} browser
 */
export async function auditCareerPersistence(browser = {}) {
  /** @type {{ surface: string, key: string, code: string }[]} */
  const violations = [];
  const sensitiveValues = (browser.sensitiveValues ?? []).filter((value) => typeof value === "string" && value.trim().length >= 4);
  auditStorage("sessionStorage", browser.sessionStorage, sensitiveValues, violations);
  auditStorage("localStorage", browser.localStorage, sensitiveValues, violations);

  const url = browser.url ?? "";
  if (containsSensitiveValue(decodeBrowserValue(url), sensitiveValues)) violations.push({ surface: "url", key: "location", code: "SENSITIVE_VALUE_FOUND" });

  if (browser.document?.cookie && containsSensitiveValue(browser.document.cookie, sensitiveValues)) violations.push({ surface: "cookies", key: "document.cookie", code: "SENSITIVE_VALUE_FOUND" });
  try {
    const careerCookies = browser.document?.cookie.split(";").map((entry) => entry.split("=")[0]?.trim()).filter((key) => key?.startsWith("morethan-career-copilot")) ?? [];
    careerCookies.forEach((key) => violations.push({ surface: "cookies", key, code: "KEY_FORBIDDEN" }));
  } catch { /* inaccessible cookies are treated as unavailable */ }

  try {
    const cacheNames = await browser.caches?.keys?.() ?? [];
    cacheNames.filter((name) => name.startsWith("morethan-career-copilot")).forEach((key) => violations.push({ surface: "cacheStorage", key, code: "KEY_FORBIDDEN" }));
  } catch { /* unsupported cache enumeration */ }

  try {
    const databases = await browser.indexedDB?.databases?.() ?? [];
    for (const database of databases) {
      if (typeof database.name === "string" && database.name.startsWith("morethan-career-copilot")) violations.push({ surface: "indexedDB", key: database.name, code: "KEY_FORBIDDEN" });
    }
  } catch { /* unsupported database enumeration */ }

  return { policyVersion: CAREER_PERSISTENCE_POLICY_VERSION, valid: violations.length === 0, violations };
}

/** @param {string} area @param {Storage | undefined} storage @param {string[]} sensitiveValues @param {{ surface: string, key: string, code: string }[]} violations */
function auditStorage(area, storage, sensitiveValues, violations) {
  if (!storage) return;
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) continue;
      const value = storage.getItem(key) ?? "";
      if (containsSensitiveValue(`${key}\n${value}`, sensitiveValues)) violations.push({ surface: area, key, code: "SENSITIVE_VALUE_FOUND" });
      if (key.startsWith("morethan-career-copilot")) {
        const validation = validateCareerPersistenceEntry(area, key, value);
        if (!validation.valid) violations.push({ surface: area, key, code: validation.code ?? "ENTRY_FORBIDDEN" });
      }
    }
  } catch { /* unavailable storage is not written to */ }
}

/** @param {string} value @param {string[]} sensitiveValues */
function containsSensitiveValue(value, sensitiveValues) { return sensitiveValues.some((sensitive) => value.includes(sensitive)); }

/** @param {string} value */
function decodeBrowserValue(value) {
  try { return decodeURIComponent(value.replace(/\+/g, " ")); }
  catch { return value; }
}
