export const ROLE_FAMILY_MAP_SCHEMA_VERSION = "1.0.0";
export const ROLE_FAMILY_MAP_STATUSES = Object.freeze(["draft", "published", "retired"]);

/**
 * Validates the M5-04 direction and role-family mapping registry.
 * The schema is deliberately closed so company names, tiers and probabilities
 * cannot quietly become matching inputs.
 * @param {unknown} value
 */
export function validateRoleFamilyMap(value) {
  /** @type {{ code: string, path: string }[]} */
  const errors = [];
  /** @type {(code: string, path: string) => void} */
  const add = (code, path) => { errors.push({ code, path }); };
  if (!isRecord(value)) return { valid: false, errors: [{ code: "ROOT_INVALID", path: "$" }] };
  const registry = /** @type {Record<string, any>} */ (value);

  allowed(registry, ["schemaVersion", "mappingVersion", "status", "publishedAt", "reviewedAt", "validThrough", "scope", "sources", "directions", "roleFamilies", "mappingPolicy"], "$", "ROOT_KEY_UNKNOWN", add);
  if (registry.schemaVersion !== ROLE_FAMILY_MAP_SCHEMA_VERSION) add("SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion");
  requiredText(registry.mappingVersion, "$.mappingVersion", "MAPPING_VERSION_INVALID", add);
  enumValue(registry.status, ROLE_FAMILY_MAP_STATUSES, "$.status", "STATUS_INVALID", add);
  timestamp(registry.publishedAt, "$.publishedAt", "PUBLISHED_AT_INVALID", add);
  date(registry.reviewedAt, "$.reviewedAt", "REVIEWED_AT_INVALID", add);
  date(registry.validThrough, "$.validThrough", "VALID_THROUGH_INVALID", add);
  requiredText(registry.scope, "$.scope", "SCOPE_INVALID", add);
  if (isDate(registry.reviewedAt) && isDate(registry.validThrough) && registry.reviewedAt > registry.validThrough) add("VALID_THROUGH_BEFORE_REVIEW", "$.validThrough");

  const sourceIds = validateSources(registry.sources, add);
  const directionIds = validateDirections(registry.directions, add);
  const roleIds = validateRoleFamilies(registry.roleFamilies, directionIds, sourceIds, add);
  validateDirectionRoleReferences(registry.directions, roleIds, add);
  validateAdjacentReferences(registry.roleFamilies, roleIds, add);
  validateMappingPolicy(registry.mappingPolicy, add);

  if (registry.status === "published") {
    if (!Array.isArray(registry.directions) || !registry.directions.length) add("PUBLISHED_DIRECTIONS_REQUIRED", "$.directions");
    if (!Array.isArray(registry.roleFamilies) || !registry.roleFamilies.length) add("PUBLISHED_ROLE_FAMILIES_REQUIRED", "$.roleFamilies");
  }
  return { valid: errors.length === 0, errors };
}

/** @param {unknown} registry */
export function assertRoleFamilyMap(registry) {
  const result = validateRoleFamilyMap(registry);
  if (!result.valid) throw new RoleFamilyMapError(result.errors);
  return registry;
}

/**
 * Maps a title and responsibility text to at most three standard role families.
 * Company names and other identity attributes are not accepted as inputs.
 * @param {{ roleTitle?: string, responsibilityText?: string }} input
 * @param {any} registry
 */
export function mapRoleFamily(input, registry) {
  assertRoleFamilyMap(registry);
  const roleTitle = cleanText(input?.roleTitle);
  const responsibilityText = cleanText(input?.responsibilityText);
  if (!roleTitle && !responsibilityText) return { status: "unmapped", matches: [], caveat: registry.mappingPolicy.caveat };

  const candidates = registry.roleFamilies.map((/** @type {any} */ role) => {
    const aliasMatches = role.aliases.filter((/** @type {string} */ alias) => includesTerm(roleTitle, alias));
    const titleKeywordMatches = role.jdKeywords.filter((/** @type {string} */ keyword) => includesTerm(roleTitle, keyword));
    const responsibilityKeywordMatches = role.jdKeywords.filter((/** @type {string} */ keyword) => includesTerm(responsibilityText, keyword));
    const matchedKeywords = [...new Set([...titleKeywordMatches, ...responsibilityKeywordMatches])];
    const titleMatched = aliasMatches.length > 0;
    const eligible = titleMatched || matchedKeywords.length >= registry.mappingPolicy.minimumKeywordHitsWithoutAlias;
    return {
      roleFamilyId: role.id,
      roleFamilyLabel: role.label,
      directionId: role.directionId,
      directionLabel: registry.directions.find((/** @type {any} */ direction) => direction.id === role.directionId)?.label ?? role.directionId,
      confidence: titleMatched ? "title_alias" : "keyword_evidence",
      aliasMatches,
      keywordMatches: matchedKeywords,
      score: titleMatched ? 100 + aliasMatches.length * 10 + matchedKeywords.length : matchedKeywords.length,
      eligible,
    };
  });
  const titleCandidates = candidates.filter((/** @type {any} */ candidate) => candidate.aliasMatches.length > 0);
  const eligibleCandidates = titleCandidates.length ? titleCandidates : candidates.filter((/** @type {any} */ candidate) => candidate.eligible);
  const matches = eligibleCandidates
    .sort((/** @type {any} */ left, /** @type {any} */ right) => right.score - left.score || left.roleFamilyId.localeCompare(right.roleFamilyId))
    .slice(0, registry.mappingPolicy.maxCandidates)
    .map((/** @type {any} */ candidate) => {
      const { score: _score, eligible: _eligible, ...match } = candidate;
      return match;
    });

  const status = !matches.length ? "unmapped" : titleCandidates.length === 1 ? "mapped" : "needs_review";
  return { status, matches, caveat: registry.mappingPolicy.caveat };
}

export class RoleFamilyMapError extends Error {
  /** @param {{ code: string, path: string }[]} errors */
  constructor(errors) {
    super("岗位族映射表未通过校验。");
    this.name = "RoleFamilyMapError";
    this.code = "ROLE_FAMILY_MAP_INVALID";
    this.errors = errors;
  }
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateSources(value, add) {
  const ids = new Set();
  if (!Array.isArray(value)) { add("SOURCES_INVALID", "$.sources"); return ids; }
  value.forEach((source, index) => {
    const path = `$.sources[${index}]`;
    if (!isRecord(source)) { add("SOURCE_INVALID", path); return; }
    allowed(source, ["id", "title", "publisher", "url", "sourceType", "usage", "verifiedAt"], path, "SOURCE_KEY_UNKNOWN", add);
    stableId(source.id, `${path}.id`, "SOURCE_ID_INVALID", add);
    unique(source.id, ids, `${path}.id`, "SOURCE_ID_DUPLICATE", add);
    ["title", "publisher", "sourceType", "usage"].forEach((field) => requiredText(source[field], `${path}.${field}`, `SOURCE_${field.toUpperCase()}_INVALID`, add));
    httpsUrl(source.url, `${path}.url`, "SOURCE_URL_INVALID", add);
    date(source.verifiedAt, `${path}.verifiedAt`, "SOURCE_VERIFIED_AT_INVALID", add);
  });
  return ids;
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateDirections(value, add) {
  const ids = new Set();
  if (!Array.isArray(value)) { add("DIRECTIONS_INVALID", "$.directions"); return ids; }
  value.forEach((direction, index) => {
    const path = `$.directions[${index}]`;
    if (!isRecord(direction)) { add("DIRECTION_INVALID", path); return; }
    allowed(direction, ["id", "label", "profileId", "description", "roleFamilyIds"], path, "DIRECTION_KEY_UNKNOWN", add);
    stableId(direction.id, `${path}.id`, "DIRECTION_ID_INVALID", add);
    unique(direction.id, ids, `${path}.id`, "DIRECTION_ID_DUPLICATE", add);
    requiredText(direction.label, `${path}.label`, "DIRECTION_LABEL_INVALID", add);
    stableId(direction.profileId, `${path}.profileId`, "DIRECTION_PROFILE_ID_INVALID", add);
    requiredText(direction.description, `${path}.description`, "DIRECTION_DESCRIPTION_INVALID", add);
    stableIdArray(direction.roleFamilyIds, `${path}.roleFamilyIds`, "DIRECTION_ROLE_FAMILY_IDS_INVALID", add, true);
  });
  return ids;
}

/** @param {unknown} value @param {Set<unknown>} directionIds @param {Set<unknown>} sourceIds @param {(code: string, path: string) => void} add */
function validateRoleFamilies(value, directionIds, sourceIds, add) {
  const ids = new Set();
  if (!Array.isArray(value)) { add("ROLE_FAMILIES_INVALID", "$.roleFamilies"); return ids; }
  value.forEach((role, index) => {
    const path = `$.roleFamilies[${index}]`;
    if (!isRecord(role)) { add("ROLE_FAMILY_INVALID", path); return; }
    allowed(role, ["id", "label", "directionId", "aliases", "coreTasks", "typicalOutputs", "evidenceSignals", "jdKeywords", "adjacentRoleFamilyIds", "sourceIds", "review"], path, "ROLE_FAMILY_KEY_UNKNOWN", add);
    stableId(role.id, `${path}.id`, "ROLE_FAMILY_ID_INVALID", add);
    unique(role.id, ids, `${path}.id`, "ROLE_FAMILY_ID_DUPLICATE", add);
    requiredText(role.label, `${path}.label`, "ROLE_FAMILY_LABEL_INVALID", add);
    reference(role.directionId, directionIds, `${path}.directionId`, "ROLE_FAMILY_DIRECTION_UNKNOWN", add);
    textArray(role.aliases, `${path}.aliases`, "ROLE_FAMILY_ALIASES_INVALID", add, true);
    textArray(role.coreTasks, `${path}.coreTasks`, "ROLE_FAMILY_CORE_TASKS_INVALID", add, true);
    textArray(role.typicalOutputs, `${path}.typicalOutputs`, "ROLE_FAMILY_OUTPUTS_INVALID", add, true);
    textArray(role.evidenceSignals, `${path}.evidenceSignals`, "ROLE_FAMILY_EVIDENCE_INVALID", add, true);
    textArray(role.jdKeywords, `${path}.jdKeywords`, "ROLE_FAMILY_KEYWORDS_INVALID", add, true);
    stableIdArray(role.adjacentRoleFamilyIds, `${path}.adjacentRoleFamilyIds`, "ROLE_FAMILY_ADJACENT_INVALID", add, true);
    referenceArray(role.sourceIds, sourceIds, `${path}.sourceIds`, "ROLE_FAMILY_SOURCES_INVALID", "ROLE_FAMILY_SOURCE_UNKNOWN", add, true);
    validateReview(role.review, path, add);
  });
  return ids;
}

/** @param {unknown} value @param {Set<unknown>} roleIds @param {(code: string, path: string) => void} add */
function validateDirectionRoleReferences(value, roleIds, add) {
  if (!Array.isArray(value)) return;
  value.forEach((direction, index) => {
    if (!isRecord(direction) || !Array.isArray(direction.roleFamilyIds)) return;
    direction.roleFamilyIds.forEach((/** @type {unknown} */ id, /** @type {number} */ position) => reference(id, roleIds, `$.directions[${index}].roleFamilyIds[${position}]`, "DIRECTION_ROLE_FAMILY_UNKNOWN", add));
  });
}

/** @param {unknown} value @param {Set<unknown>} roleIds @param {(code: string, path: string) => void} add */
function validateAdjacentReferences(value, roleIds, add) {
  if (!Array.isArray(value)) return;
  value.forEach((role, index) => {
    if (!isRecord(role) || !Array.isArray(role.adjacentRoleFamilyIds)) return;
    role.adjacentRoleFamilyIds.forEach((/** @type {unknown} */ id, /** @type {number} */ position) => {
      reference(id, roleIds, `$.roleFamilies[${index}].adjacentRoleFamilyIds[${position}]`, "ROLE_FAMILY_ADJACENT_UNKNOWN", add);
      if (id === role.id) add("ROLE_FAMILY_ADJACENT_SELF", `$.roleFamilies[${index}].adjacentRoleFamilyIds[${position}]`);
    });
  });
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateMappingPolicy(value, add) {
  const path = "$.mappingPolicy";
  if (!isRecord(value)) { add("MAPPING_POLICY_INVALID", path); return; }
  const policy = /** @type {Record<string, any>} */ (value);
  allowed(policy, ["inputFields", "ignoredFields", "titleAliasPriority", "minimumKeywordHitsWithoutAlias", "maxCandidates", "fallback", "caveat"], path, "MAPPING_POLICY_KEY_UNKNOWN", add);
  if (JSON.stringify(policy.inputFields) !== JSON.stringify(["role_title", "responsibility_text"])) add("MAPPING_INPUT_FIELDS_INVALID", `${path}.inputFields`);
  textArray(policy.ignoredFields, `${path}.ignoredFields`, "MAPPING_IGNORED_FIELDS_INVALID", add, true);
  ["company_name", "school_name", "gender", "age"].forEach((field) => {
    if (!Array.isArray(policy.ignoredFields) || !policy.ignoredFields.includes(field)) add("MAPPING_SENSITIVE_FIELD_NOT_IGNORED", `${path}.ignoredFields`);
  });
  if (policy.titleAliasPriority !== true) add("MAPPING_TITLE_PRIORITY_REQUIRED", `${path}.titleAliasPriority`);
  integerRange(policy.minimumKeywordHitsWithoutAlias, 2, 6, `${path}.minimumKeywordHitsWithoutAlias`, "MAPPING_MINIMUM_HITS_INVALID", add);
  integerRange(policy.maxCandidates, 1, 3, `${path}.maxCandidates`, "MAPPING_MAX_CANDIDATES_INVALID", add);
  if (policy.fallback !== "unmapped") add("MAPPING_FALLBACK_INVALID", `${path}.fallback`);
  requiredText(policy.caveat, `${path}.caveat`, "MAPPING_CAVEAT_INVALID", add);
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function validateReview(value, path, add) {
  if (!isRecord(value)) { add("ROLE_FAMILY_REVIEW_INVALID", `${path}.review`); return; }
  const review = /** @type {Record<string, unknown>} */ (value);
  allowed(review, ["status", "reviewedBy", "reviewedAt"], `${path}.review`, "ROLE_FAMILY_REVIEW_KEY_UNKNOWN", add);
  if (review.status !== "reviewed") add("ROLE_FAMILY_REVIEW_STATUS_INVALID", `${path}.review.status`);
  requiredText(review.reviewedBy, `${path}.reviewedBy`, "ROLE_FAMILY_REVIEWER_INVALID", add);
  date(review.reviewedAt, `${path}.reviewedAt`, "ROLE_FAMILY_REVIEWED_AT_INVALID", add);
}

/** @param {unknown} value */
function cleanText(value) { return typeof value === "string" ? value.trim().toLowerCase() : ""; }
/** @param {string} text @param {string} term */
function includesTerm(text, term) { return Boolean(text && term && text.includes(term.toLowerCase())); }
/** @param {unknown} value */
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
/** @param {Record<string, unknown>} value @param {string[]} keys @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function allowed(value, keys, path, code, add) { Object.keys(value).forEach((key) => { if (!keys.includes(key)) add(code, `${path}.${key}`); }); }
/** @param {unknown} value */
function isDate(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function date(value, path, code, add) { if (!isDate(value)) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function timestamp(value, path, code, add) { if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || !value.includes("T")) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function requiredText(value, path, code, add) { if (typeof value !== "string" || !value.trim()) add(code, path); }
/** @param {unknown} value @param {readonly string[]} values @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function enumValue(value, values, path, code, add) { if (!values.includes(/** @type {any} */ (value))) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function stableId(value, path, code, add) { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) add(code, path); }
/** @param {unknown} value @param {Set<unknown>} ids @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function unique(value, ids, path, code, add) { if (ids.has(value)) add(code, path); else ids.add(value); }
/** @param {unknown} value @param {Set<unknown>} ids @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function reference(value, ids, path, code, add) { if (!ids.has(value)) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add @param {boolean} required */
function textArray(value, path, code, add, required = false) { if (!Array.isArray(value) || (required && !value.length) || value.some((item) => typeof item !== "string" || !item.trim()) || new Set(value).size !== value.length) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add @param {boolean} required */
function stableIdArray(value, path, code, add, required = false) { if (!Array.isArray(value) || (required && !value.length) || value.some((item) => typeof item !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item)) || new Set(value).size !== value.length) add(code, path); }
/** @param {unknown} value @param {Set<unknown>} ids @param {string} path @param {string} invalidCode @param {string} unknownCode @param {(code: string, path: string) => void} add @param {boolean} required */
function referenceArray(value, ids, path, invalidCode, unknownCode, add, required = false) { stableIdArray(value, path, invalidCode, add, required); if (Array.isArray(value)) value.forEach((item, index) => reference(item, ids, `${path}[${index}]`, unknownCode, add)); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function httpsUrl(value, path, code, add) { try { if (typeof value !== "string" || new URL(value).protocol !== "https:") add(code, path); } catch { add(code, path); } }
/** @param {unknown} value @param {number} min @param {number} max @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function integerRange(value, min, max, path, code, add) { if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) add(code, path); }
