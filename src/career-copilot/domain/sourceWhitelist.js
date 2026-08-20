export const SOURCE_WHITELIST_VERSION = "1.0.0";

export const WHITELIST_SOURCE_TYPES = Object.freeze(["government", "university", "company_careers"]);
export const WHITELIST_ACCESS_MODES = Object.freeze(["public", "javascript_required", "login_optional_for_application"]);
export const WHITELIST_USAGE_POLICIES = Object.freeze(["link_only", "facts_and_short_excerpt", "open_data"]);
export const WHITELIST_AUTOMATION_POLICIES = Object.freeze(["manual_review_only", "official_api_only"]);
export const WHITELIST_ALLOWED_CLAIMS = Object.freeze([
  "publisher_identity",
  "recruitment_entrance",
  "program_schedule",
  "role_listing",
  "role_details",
  "application_rules",
  "career_guidance",
]);
export const WHITELIST_RECRUITMENT_TYPES = Object.freeze(["internship", "campus"]);
export const WHITELIST_SOURCE_STATUSES = Object.freeze(["approved", "conditional"]);

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/** @typedef {typeof WHITELIST_SOURCE_TYPES[number]} WhitelistSourceType */
/** @typedef {typeof WHITELIST_ACCESS_MODES[number]} WhitelistAccessMode */
/** @typedef {typeof WHITELIST_USAGE_POLICIES[number]} WhitelistUsagePolicy */
/** @typedef {typeof WHITELIST_AUTOMATION_POLICIES[number]} WhitelistAutomationPolicy */
/** @typedef {typeof WHITELIST_ALLOWED_CLAIMS[number]} WhitelistAllowedClaim */
/** @typedef {typeof WHITELIST_RECRUITMENT_TYPES[number]} WhitelistRecruitmentType */
/** @typedef {typeof WHITELIST_SOURCE_STATUSES[number]} WhitelistSourceStatus */
/** @typedef {{ usagePolicy: WhitelistUsagePolicy, automationPolicy: WhitelistAutomationPolicy, maxExcerptCharacters: number, requiredCitationFields: string[], liveStatusRule: string }} SourceWhitelistDefaultPolicy */
/** @typedef {{ id: string, name: string, publisher: string, sourceType: WhitelistSourceType, baseUrl: string, allowedHostnames: string[], identityEvidenceUrl: string, accessMode: WhitelistAccessMode, usagePolicy: WhitelistUsagePolicy, automationPolicy: WhitelistAutomationPolicy, recruitmentTypes: WhitelistRecruitmentType[], allowedClaims: WhitelistAllowedClaim[], liveStatusAuthority: boolean, reviewIntervalDays: number, restrictions: string[], verifiedAt: string, status: WhitelistSourceStatus }} SourceWhitelistEntry */
/** @typedef {{ id: string, name: string, url: string, reason: string, reviewedAt: string }} SourceWhitelistExclusion */
/** @typedef {{ schemaVersion: string, registryVersion: string, status: "published", locale: "zh-CN", verifiedAt: string, defaultPolicy: SourceWhitelistDefaultPolicy, sources: SourceWhitelistEntry[], exclusions: SourceWhitelistExclusion[], disclaimer: string }} SourceWhitelist */
/** @typedef {{ code: string, path: string }} SourceWhitelistValidationError */

/**
 * Validates the approved public-source registry. Being listed here permits a
 * manually verified citation; it never grants permission for bulk collection.
 * @param {unknown} value
 * @returns {{ valid: boolean, errors: SourceWhitelistValidationError[] }}
 */
export function validateSourceWhitelist(value) {
  /** @type {SourceWhitelistValidationError[]} */
  const errors = [];
  /** @param {string} code @param {string} path */
  const add = (code, path) => errors.push({ code, path });
  if (!isRecord(value)) return { valid: false, errors: [{ code: "ROOT_INVALID", path: "$" }] };
  allowed(value, ["schemaVersion", "registryVersion", "status", "locale", "verifiedAt", "defaultPolicy", "sources", "exclusions", "disclaimer"], "$", "ROOT_KEY_UNKNOWN", add);
  if (value.schemaVersion !== SOURCE_WHITELIST_VERSION) add("SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion");
  stableText(value.registryVersion, "$.registryVersion", "REGISTRY_VERSION_INVALID", add);
  if (value.status !== "published") add("REGISTRY_STATUS_INVALID", "$.status");
  if (value.locale !== "zh-CN") add("LOCALE_UNSUPPORTED", "$.locale");
  date(value.verifiedAt, "$.verifiedAt", "REGISTRY_VERIFIED_AT_INVALID", add);
  validateDefaultPolicy(value.defaultPolicy, add);
  validateSources(value.sources, value.defaultPolicy, add);
  validateExclusions(value.exclusions, add);
  requiredText(value.disclaimer, "$.disclaimer", "DISCLAIMER_INVALID", add);
  return { valid: errors.length === 0, errors };
}

/**
 * Finds the policy for a public HTTPS URL by exact approved hostname.
 * @param {string} url
 * @param {SourceWhitelist} whitelist
 * @returns {SourceWhitelistEntry | null}
 */
export function findWhitelistedSource(url, whitelist) {
  if (!validateSourceWhitelist(whitelist).valid) return null;
  const hostname = hostnameOf(url);
  if (!hostname) return null;
  return whitelist.sources.find((source) => source.allowedHostnames.includes(hostname)) ?? null;
}

/**
 * Checks whether a claim may be attributed to a URL under the current registry.
 * Live vacancy claims require an approved company career source and a role-level
 * page that was manually checked; the whitelist entry alone is insufficient.
 * @param {string} url
 * @param {WhitelistAllowedClaim} claim
 * @param {SourceWhitelist} whitelist
 * @param {{ roleLevelPageVerified?: boolean }=} options
 * @returns {{ allowed: boolean, code: string | null, source: SourceWhitelistEntry | null }}
 */
export function evaluateSourceClaim(url, claim, whitelist, options = {}) {
  const source = findWhitelistedSource(url, whitelist);
  if (!source) return { allowed: false, code: "SOURCE_NOT_WHITELISTED", source: null };
  if (!WHITELIST_ALLOWED_CLAIMS.includes(claim) || !source.allowedClaims.includes(claim)) return { allowed: false, code: "CLAIM_NOT_ALLOWED", source };
  if ((claim === "role_listing" || claim === "role_details") && source.liveStatusAuthority && !options.roleLevelPageVerified) {
    return { allowed: false, code: "ROLE_LEVEL_VERIFICATION_REQUIRED", source };
  }
  return { allowed: true, code: null, source };
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateDefaultPolicy(value, add) {
  if (!isRecord(value)) { add("DEFAULT_POLICY_INVALID", "$.defaultPolicy"); return; }
  allowed(value, ["usagePolicy", "automationPolicy", "maxExcerptCharacters", "requiredCitationFields", "liveStatusRule"], "$.defaultPolicy", "DEFAULT_POLICY_KEY_UNKNOWN", add);
  enumValue(value.usagePolicy, WHITELIST_USAGE_POLICIES, "$.defaultPolicy.usagePolicy", "DEFAULT_USAGE_POLICY_INVALID", add);
  enumValue(value.automationPolicy, WHITELIST_AUTOMATION_POLICIES, "$.defaultPolicy.automationPolicy", "DEFAULT_AUTOMATION_POLICY_INVALID", add);
  if (!Number.isInteger(value.maxExcerptCharacters) || /** @type {number} */ (value.maxExcerptCharacters) < 0 || /** @type {number} */ (value.maxExcerptCharacters) > 200) add("MAX_EXCERPT_CHARACTERS_INVALID", "$.defaultPolicy.maxExcerptCharacters");
  const requiredFields = ["title", "publisher", "url", "verifiedAt"];
  if (!Array.isArray(value.requiredCitationFields) || value.requiredCitationFields.length !== requiredFields.length || requiredFields.some((field) => !value.requiredCitationFields.includes(field))) add("REQUIRED_CITATION_FIELDS_INVALID", "$.defaultPolicy.requiredCitationFields");
  requiredText(value.liveStatusRule, "$.defaultPolicy.liveStatusRule", "LIVE_STATUS_RULE_INVALID", add);
}

/** @param {unknown} value @param {unknown} defaultPolicy @param {(code: string, path: string) => void} add */
function validateSources(value, defaultPolicy, add) {
  const ids = new Set();
  const baseUrls = new Set();
  if (!Array.isArray(value) || value.length === 0) { add("SOURCES_INVALID", "$.sources"); return; }
  value.forEach((source, index) => {
    const path = `$.sources[${index}]`;
    if (!isRecord(source)) { add("SOURCE_INVALID", path); return; }
    allowed(source, ["id", "name", "publisher", "sourceType", "baseUrl", "allowedHostnames", "identityEvidenceUrl", "accessMode", "usagePolicy", "automationPolicy", "recruitmentTypes", "allowedClaims", "liveStatusAuthority", "reviewIntervalDays", "restrictions", "verifiedAt", "status"], path, "SOURCE_KEY_UNKNOWN", add);
    stableId(source.id, `${path}.id`, "SOURCE_ID_INVALID", add);
    unique(source.id, ids, `${path}.id`, "SOURCE_ID_DUPLICATE", add);
    requiredText(source.name, `${path}.name`, "SOURCE_NAME_INVALID", add);
    requiredText(source.publisher, `${path}.publisher`, "SOURCE_PUBLISHER_INVALID", add);
    enumValue(source.sourceType, WHITELIST_SOURCE_TYPES, `${path}.sourceType`, "SOURCE_TYPE_INVALID", add);
    httpsUrl(source.baseUrl, `${path}.baseUrl`, "SOURCE_BASE_URL_INVALID", add);
    unique(source.baseUrl, baseUrls, `${path}.baseUrl`, "SOURCE_BASE_URL_DUPLICATE", add);
    hostnameArray(source.allowedHostnames, `${path}.allowedHostnames`, add);
    const baseHostname = hostnameOf(source.baseUrl);
    if (baseHostname && (!Array.isArray(source.allowedHostnames) || !source.allowedHostnames.includes(baseHostname))) add("SOURCE_BASE_HOST_NOT_ALLOWED", `${path}.allowedHostnames`);
    httpsUrl(source.identityEvidenceUrl, `${path}.identityEvidenceUrl`, "SOURCE_IDENTITY_EVIDENCE_URL_INVALID", add);
    enumValue(source.accessMode, WHITELIST_ACCESS_MODES, `${path}.accessMode`, "SOURCE_ACCESS_MODE_INVALID", add);
    enumValue(source.usagePolicy, WHITELIST_USAGE_POLICIES, `${path}.usagePolicy`, "SOURCE_USAGE_POLICY_INVALID", add);
    enumValue(source.automationPolicy, WHITELIST_AUTOMATION_POLICIES, `${path}.automationPolicy`, "SOURCE_AUTOMATION_POLICY_INVALID", add);
    if (isRecord(defaultPolicy) && defaultPolicy.usagePolicy === "link_only" && source.usagePolicy !== "link_only") add("SOURCE_USAGE_EXCEEDS_DEFAULT", `${path}.usagePolicy`);
    if (isRecord(defaultPolicy) && defaultPolicy.automationPolicy === "manual_review_only" && source.automationPolicy !== "manual_review_only") add("SOURCE_AUTOMATION_EXCEEDS_DEFAULT", `${path}.automationPolicy`);
    enumArray(source.recruitmentTypes, WHITELIST_RECRUITMENT_TYPES, `${path}.recruitmentTypes`, "SOURCE_RECRUITMENT_TYPES_INVALID", add);
    enumArray(source.allowedClaims, WHITELIST_ALLOWED_CLAIMS, `${path}.allowedClaims`, "SOURCE_ALLOWED_CLAIMS_INVALID", add);
    if (typeof source.liveStatusAuthority !== "boolean") add("SOURCE_LIVE_STATUS_AUTHORITY_INVALID", `${path}.liveStatusAuthority`);
    if (source.liveStatusAuthority === true && source.sourceType !== "company_careers") add("LIVE_STATUS_AUTHORITY_FORBIDDEN", `${path}.liveStatusAuthority`);
    if (source.sourceType === "company_careers" && source.liveStatusAuthority !== true) add("COMPANY_LIVE_STATUS_AUTHORITY_REQUIRED", `${path}.liveStatusAuthority`);
    if (source.liveStatusAuthority === true && (!Array.isArray(source.allowedClaims) || !source.allowedClaims.includes("role_listing"))) add("LIVE_STATUS_ROLE_LISTING_REQUIRED", `${path}.allowedClaims`);
    if (!Number.isInteger(source.reviewIntervalDays) || /** @type {number} */ (source.reviewIntervalDays) < 1 || /** @type {number} */ (source.reviewIntervalDays) > 90) add("SOURCE_REVIEW_INTERVAL_INVALID", `${path}.reviewIntervalDays`);
    textArray(source.restrictions, `${path}.restrictions`, "SOURCE_RESTRICTIONS_INVALID", add, false);
    date(source.verifiedAt, `${path}.verifiedAt`, "SOURCE_VERIFIED_AT_INVALID", add);
    enumValue(source.status, WHITELIST_SOURCE_STATUSES, `${path}.status`, "SOURCE_STATUS_INVALID", add);
  });
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateExclusions(value, add) {
  const ids = new Set();
  if (!Array.isArray(value)) { add("EXCLUSIONS_INVALID", "$.exclusions"); return; }
  value.forEach((entry, index) => {
    const path = `$.exclusions[${index}]`;
    if (!isRecord(entry)) { add("EXCLUSION_INVALID", path); return; }
    allowed(entry, ["id", "name", "url", "reason", "reviewedAt"], path, "EXCLUSION_KEY_UNKNOWN", add);
    stableId(entry.id, `${path}.id`, "EXCLUSION_ID_INVALID", add);
    unique(entry.id, ids, `${path}.id`, "EXCLUSION_ID_DUPLICATE", add);
    requiredText(entry.name, `${path}.name`, "EXCLUSION_NAME_INVALID", add);
    httpsUrl(entry.url, `${path}.url`, "EXCLUSION_URL_INVALID", add);
    requiredText(entry.reason, `${path}.reason`, "EXCLUSION_REASON_INVALID", add);
    date(entry.reviewedAt, `${path}.reviewedAt`, "EXCLUSION_REVIEWED_AT_INVALID", add);
  });
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function hostnameArray(value, path, add) { if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length || value.some((host) => typeof host !== "string" || !HOST_PATTERN.test(host) || host !== host.toLowerCase())) add("SOURCE_HOSTNAMES_INVALID", path); }
/** @param {unknown} value @param {readonly string[]} values @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function enumArray(value, values, path, code, add) { if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length || value.some((entry) => !values.includes(/** @type {never} */ (entry)))) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add @param {boolean} allowEmpty */
function textArray(value, path, code, add, allowEmpty) { if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || new Set(value).size !== value.length || value.some((entry) => typeof entry !== "string" || !entry.trim())) add(code, path); }
/** @param {Record<string, unknown>} value @param {readonly string[]} keys @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function allowed(value, keys, path, code, add) { Object.keys(value).forEach((key) => { if (!keys.includes(key)) add(code, `${path}.${key}`); }); }
/** @param {unknown} value @param {readonly string[]} values @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function enumValue(value, values, path, code, add) { if (!values.includes(/** @type {never} */ (value))) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function requiredText(value, path, code, add) { if (typeof value !== "string" || !value.trim()) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function stableText(value, path, code, add) { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function stableId(value, path, code, add) { if (typeof value !== "string" || !ID_PATTERN.test(value)) add(code, path); }
/** @param {unknown} value @param {Set<unknown>} values @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function unique(value, values, path, code, add) { if (values.has(value)) add(code, path); else if (typeof value === "string") values.add(value); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function httpsUrl(value, path, code, add) { if (!hostnameOf(value)) add(code, path); }
/** @param {unknown} value */
function hostnameOf(value) { if (typeof value !== "string") return null; try { const url = new URL(value); return url.protocol === "https:" && url.hostname ? url.hostname.toLowerCase() : null; } catch { return null; } }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function date(value, path, code, add) { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) add(code, path); }
/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
