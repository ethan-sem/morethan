export const COMPANY_ROLE_KNOWLEDGE_BASE_VERSION = "1.0.0";

export const KNOWLEDGE_DATASET_STATUSES = Object.freeze(["draft", "published", "retired"]);
export const COMPANY_ORGANIZATION_TYPES = Object.freeze([
  "private",
  "public_company",
  "state_owned",
  "government_or_public_institution",
  "foreign_enterprise",
  "joint_venture",
  "nonprofit",
  "other",
]);
export const KNOWLEDGE_SOURCE_TYPES = Object.freeze([
  "company_careers",
  "company_official",
  "government",
  "university",
  "authorized_recruitment",
  "other_public",
]);
export const SOURCE_USAGE_POLICIES = Object.freeze(["link_only", "facts_and_short_excerpt", "open_data"]);
export const RECRUITMENT_TYPES = Object.freeze(["internship", "campus"]);
export const RECRUITMENT_ENTRANCE_STATUSES = Object.freeze(["active", "unknown", "closed"]);
export const COMPANY_ROLE_STATUSES = Object.freeze(["open", "target_pool", "unknown", "closed"]);
export const KNOWLEDGE_TAG_CATEGORIES = Object.freeze([
  "industry",
  "company_type",
  "role",
  "location",
  "program",
  "work_mode",
  "custom",
]);
export const KNOWLEDGE_REVIEW_STATUSES = Object.freeze(["draft", "reviewed"]);

const LIVE_STATUS_SOURCE_TYPES = new Set(["company_careers", "company_official", "authorized_recruitment"]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** @typedef {typeof KNOWLEDGE_DATASET_STATUSES[number]} KnowledgeDatasetStatus */
/** @typedef {typeof COMPANY_ORGANIZATION_TYPES[number]} CompanyOrganizationType */
/** @typedef {typeof KNOWLEDGE_SOURCE_TYPES[number]} KnowledgeSourceType */
/** @typedef {typeof SOURCE_USAGE_POLICIES[number]} SourceUsagePolicy */
/** @typedef {typeof RECRUITMENT_TYPES[number]} RecruitmentType */
/** @typedef {typeof RECRUITMENT_ENTRANCE_STATUSES[number]} RecruitmentEntranceStatus */
/** @typedef {typeof COMPANY_ROLE_STATUSES[number]} CompanyRoleStatus */
/** @typedef {typeof KNOWLEDGE_TAG_CATEGORIES[number]} KnowledgeTagCategory */
/** @typedef {typeof KNOWLEDGE_REVIEW_STATUSES[number]} KnowledgeReviewStatus */

/** @typedef {{ id: string, label: string, category: KnowledgeTagCategory }} KnowledgeTagDefinition */
/** @typedef {{ id: string, name: string, aliases: string[], organizationType: CompanyOrganizationType, websiteUrl: string | null, tags: string[] }} KnowledgeCompany */
/** @typedef {{ id: string, label: string, aliases: string[], parentId: string | null, tags: string[] }} KnowledgeRoleFamily */
/** @typedef {{ id: string, type: KnowledgeSourceType, title: string, publisher: string, url: string, capturedAt: string, verifiedAt: string, expiresAt: string, usagePolicy: SourceUsagePolicy, licenseNote: string, tags: string[] }} KnowledgeSource */
/** @typedef {{ id: string, companyId: string, label: string, recruitmentType: RecruitmentType, url: string, sourceIds: string[], status: RecruitmentEntranceStatus, capturedAt: string, verifiedAt: string, expiresAt: string, tags: string[] }} RecruitmentEntrance */
/** @typedef {{ status: KnowledgeReviewStatus, reviewedBy: string | null, reviewedAt: string | null }} KnowledgeReview */
/** @typedef {{ id: string, companyId: string, roleFamilyId: string, roleName: string | null, locations: string[], recruitmentType: RecruitmentType, status: CompanyRoleStatus, entranceIds: string[], sourceIds: string[], capturedAt: string, verifiedAt: string, expiresAt: string, evidenceRequirements: string[], advisorNotes: string[], tags: string[], review: KnowledgeReview }} CompanyRoleRecord */
/** @typedef {{ schemaVersion: string, datasetVersion: string, status: KnowledgeDatasetStatus, locale: string, publishedAt: string | null, validThrough: string | null, disclaimer: string, tagDefinitions: KnowledgeTagDefinition[], companies: KnowledgeCompany[], roleFamilies: KnowledgeRoleFamily[], sources: KnowledgeSource[], recruitmentEntrances: RecruitmentEntrance[], records: CompanyRoleRecord[] }} CompanyRoleKnowledgeBase */
/** @typedef {{ code: string, path: string }} CompanyRoleKnowledgeBaseValidationError */

/**
 * Creates a valid but deliberately empty draft. Real companies and vacancies are
 * added only after a public source has been checked.
 * @param {string} datasetVersion
 * @returns {CompanyRoleKnowledgeBase}
 */
export function createEmptyCompanyRoleKnowledgeBase(datasetVersion = "draft-2026.08") {
  return {
    schemaVersion: COMPANY_ROLE_KNOWLEDGE_BASE_VERSION,
    datasetVersion,
    status: "draft",
    locale: "zh-CN",
    publishedAt: null,
    validThrough: null,
    disclaimer: "本数据包尚未发布，不包含占位公司或虚构在招信息；岗位状态以来源页和用户申请时再次核验为准。",
    tagDefinitions: [],
    companies: [],
    roleFamilies: [],
    sources: [],
    recruitmentEntrances: [],
    records: [],
  };
}

/**
 * Closed-schema validation for the static company and early-career role package.
 * It validates shape, references and source/date safety without using the clock;
 * build-time expiry enforcement belongs to M5-05.
 * @param {unknown} value
 * @returns {{ valid: boolean, errors: CompanyRoleKnowledgeBaseValidationError[] }}
 */
export function validateCompanyRoleKnowledgeBase(value) {
  /** @type {CompanyRoleKnowledgeBaseValidationError[]} */
  const errors = [];
  /** @param {string} code @param {string} path */
  const add = (code, path) => errors.push({ code, path });
  if (!isRecord(value)) return { valid: false, errors: [{ code: "ROOT_INVALID", path: "$" }] };

  allowed(value, ["schemaVersion", "datasetVersion", "status", "locale", "publishedAt", "validThrough", "disclaimer", "tagDefinitions", "companies", "roleFamilies", "sources", "recruitmentEntrances", "records"], "$", "ROOT_KEY_UNKNOWN", add);
  if (value.schemaVersion !== COMPANY_ROLE_KNOWLEDGE_BASE_VERSION) add("SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion");
  stableText(value.datasetVersion, "$.datasetVersion", "DATASET_VERSION_INVALID", add);
  enumValue(value.status, KNOWLEDGE_DATASET_STATUSES, "$.status", "DATASET_STATUS_INVALID", add);
  if (value.locale !== "zh-CN") add("LOCALE_UNSUPPORTED", "$.locale");
  nullableTimestamp(value.publishedAt, "$.publishedAt", "PUBLISHED_AT_INVALID", add);
  nullableDate(value.validThrough, "$.validThrough", "VALID_THROUGH_INVALID", add);
  requiredText(value.disclaimer, "$.disclaimer", "DISCLAIMER_INVALID", add);

  const tagIds = validateTags(value.tagDefinitions, add);
  const companyIds = validateCompanies(value.companies, tagIds, add);
  const roleFamilyIds = validateRoleFamilies(value.roleFamilies, tagIds, add);
  const sourceIndex = validateSources(value.sources, tagIds, add);
  const entranceIndex = validateEntrances(value.recruitmentEntrances, companyIds, sourceIndex, tagIds, add);
  validateRecords(value.records, companyIds, roleFamilyIds, sourceIndex, entranceIndex, tagIds, add);
  validatePublicationState(value, add);
  return { valid: errors.length === 0, errors };
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateTags(value, add) {
  const ids = new Set();
  if (!Array.isArray(value)) { add("TAG_DEFINITIONS_INVALID", "$.tagDefinitions"); return ids; }
  value.forEach((tag, index) => {
    const path = `$.tagDefinitions[${index}]`;
    if (!isRecord(tag)) { add("TAG_DEFINITION_INVALID", path); return; }
    allowed(tag, ["id", "label", "category"], path, "TAG_DEFINITION_KEY_UNKNOWN", add);
    stableId(tag.id, `${path}.id`, "TAG_ID_INVALID", add);
    uniqueId(tag.id, ids, `${path}.id`, "TAG_ID_DUPLICATE", add);
    requiredText(tag.label, `${path}.label`, "TAG_LABEL_INVALID", add);
    enumValue(tag.category, KNOWLEDGE_TAG_CATEGORIES, `${path}.category`, "TAG_CATEGORY_INVALID", add);
  });
  return ids;
}

/** @param {unknown} value @param {Set<unknown>} tagIds @param {(code: string, path: string) => void} add */
function validateCompanies(value, tagIds, add) {
  const ids = new Set();
  if (!Array.isArray(value)) { add("COMPANIES_INVALID", "$.companies"); return ids; }
  value.forEach((company, index) => {
    const path = `$.companies[${index}]`;
    if (!isRecord(company)) { add("COMPANY_INVALID", path); return; }
    allowed(company, ["id", "name", "aliases", "organizationType", "websiteUrl", "tags"], path, "COMPANY_KEY_UNKNOWN", add);
    stableId(company.id, `${path}.id`, "COMPANY_ID_INVALID", add);
    uniqueId(company.id, ids, `${path}.id`, "COMPANY_ID_DUPLICATE", add);
    requiredText(company.name, `${path}.name`, "COMPANY_NAME_INVALID", add);
    textArray(company.aliases, `${path}.aliases`, "COMPANY_ALIASES_INVALID", add, true);
    enumValue(company.organizationType, COMPANY_ORGANIZATION_TYPES, `${path}.organizationType`, "COMPANY_ORGANIZATION_TYPE_INVALID", add);
    nullableHttpsUrl(company.websiteUrl, `${path}.websiteUrl`, "COMPANY_WEBSITE_URL_INVALID", add);
    tagArray(company.tags, `${path}.tags`, tagIds, add);
  });
  return ids;
}

/** @param {unknown} value @param {Set<unknown>} tagIds @param {(code: string, path: string) => void} add */
function validateRoleFamilies(value, tagIds, add) {
  const ids = new Set();
  if (!Array.isArray(value)) { add("ROLE_FAMILIES_INVALID", "$.roleFamilies"); return ids; }
  value.forEach((role, index) => {
    const path = `$.roleFamilies[${index}]`;
    if (!isRecord(role)) { add("ROLE_FAMILY_INVALID", path); return; }
    allowed(role, ["id", "label", "aliases", "parentId", "tags"], path, "ROLE_FAMILY_KEY_UNKNOWN", add);
    stableId(role.id, `${path}.id`, "ROLE_FAMILY_ID_INVALID", add);
    uniqueId(role.id, ids, `${path}.id`, "ROLE_FAMILY_ID_DUPLICATE", add);
    requiredText(role.label, `${path}.label`, "ROLE_FAMILY_LABEL_INVALID", add);
    textArray(role.aliases, `${path}.aliases`, "ROLE_FAMILY_ALIASES_INVALID", add, true);
    if (role.parentId !== null) stableId(role.parentId, `${path}.parentId`, "ROLE_FAMILY_PARENT_ID_INVALID", add);
    tagArray(role.tags, `${path}.tags`, tagIds, add);
  });
  if (Array.isArray(value)) value.forEach((role, index) => {
    if (!isRecord(role) || role.parentId === null) return;
    if (!ids.has(role.parentId)) add("ROLE_FAMILY_PARENT_UNKNOWN", `$.roleFamilies[${index}].parentId`);
    if (role.parentId === role.id) add("ROLE_FAMILY_PARENT_SELF", `$.roleFamilies[${index}].parentId`);
  });
  return ids;
}

/** @param {unknown} value @param {Set<unknown>} tagIds @param {(code: string, path: string) => void} add */
function validateSources(value, tagIds, add) {
  const ids = new Set();
  const urls = new Set();
  const index = new Map();
  if (!Array.isArray(value)) { add("SOURCES_INVALID", "$.sources"); return index; }
  value.forEach((source, sourceIndex) => {
    const path = `$.sources[${sourceIndex}]`;
    if (!isRecord(source)) { add("SOURCE_INVALID", path); return; }
    allowed(source, ["id", "type", "title", "publisher", "url", "capturedAt", "verifiedAt", "expiresAt", "usagePolicy", "licenseNote", "tags"], path, "SOURCE_KEY_UNKNOWN", add);
    stableId(source.id, `${path}.id`, "SOURCE_ID_INVALID", add);
    uniqueId(source.id, ids, `${path}.id`, "SOURCE_ID_DUPLICATE", add);
    enumValue(source.type, KNOWLEDGE_SOURCE_TYPES, `${path}.type`, "SOURCE_TYPE_INVALID", add);
    requiredText(source.title, `${path}.title`, "SOURCE_TITLE_INVALID", add);
    requiredText(source.publisher, `${path}.publisher`, "SOURCE_PUBLISHER_INVALID", add);
    httpsUrl(source.url, `${path}.url`, "SOURCE_URL_INVALID", add);
    if (typeof source.url === "string" && urls.has(source.url)) add("SOURCE_URL_DUPLICATE", `${path}.url`); else if (typeof source.url === "string") urls.add(source.url);
    timestamp(source.capturedAt, `${path}.capturedAt`, "SOURCE_CAPTURED_AT_INVALID", add);
    date(source.verifiedAt, `${path}.verifiedAt`, "SOURCE_VERIFIED_AT_INVALID", add);
    date(source.expiresAt, `${path}.expiresAt`, "SOURCE_EXPIRES_AT_INVALID", add);
    chronological(source.capturedAt, source.verifiedAt, source.expiresAt, path, "SOURCE", add);
    enumValue(source.usagePolicy, SOURCE_USAGE_POLICIES, `${path}.usagePolicy`, "SOURCE_USAGE_POLICY_INVALID", add);
    requiredText(source.licenseNote, `${path}.licenseNote`, "SOURCE_LICENSE_NOTE_INVALID", add);
    tagArray(source.tags, `${path}.tags`, tagIds, add);
    if (typeof source.id === "string") index.set(source.id, source);
  });
  return index;
}

/** @param {unknown} value @param {Set<unknown>} companyIds @param {Map<unknown, any>} sourceIndex @param {Set<unknown>} tagIds @param {(code: string, path: string) => void} add */
function validateEntrances(value, companyIds, sourceIndex, tagIds, add) {
  const ids = new Set();
  const index = new Map();
  if (!Array.isArray(value)) { add("RECRUITMENT_ENTRANCES_INVALID", "$.recruitmentEntrances"); return index; }
  value.forEach((entrance, entranceIndex) => {
    const path = `$.recruitmentEntrances[${entranceIndex}]`;
    if (!isRecord(entrance)) { add("RECRUITMENT_ENTRANCE_INVALID", path); return; }
    allowed(entrance, ["id", "companyId", "label", "recruitmentType", "url", "sourceIds", "status", "capturedAt", "verifiedAt", "expiresAt", "tags"], path, "RECRUITMENT_ENTRANCE_KEY_UNKNOWN", add);
    stableId(entrance.id, `${path}.id`, "RECRUITMENT_ENTRANCE_ID_INVALID", add);
    uniqueId(entrance.id, ids, `${path}.id`, "RECRUITMENT_ENTRANCE_ID_DUPLICATE", add);
    reference(entrance.companyId, companyIds, `${path}.companyId`, "RECRUITMENT_ENTRANCE_COMPANY_UNKNOWN", add);
    requiredText(entrance.label, `${path}.label`, "RECRUITMENT_ENTRANCE_LABEL_INVALID", add);
    enumValue(entrance.recruitmentType, RECRUITMENT_TYPES, `${path}.recruitmentType`, "RECRUITMENT_TYPE_INVALID", add);
    httpsUrl(entrance.url, `${path}.url`, "RECRUITMENT_ENTRANCE_URL_INVALID", add);
    referenceArray(entrance.sourceIds, `${path}.sourceIds`, sourceIndex, "RECRUITMENT_ENTRANCE_SOURCE_IDS_INVALID", "RECRUITMENT_ENTRANCE_SOURCE_UNKNOWN", add);
    enumValue(entrance.status, RECRUITMENT_ENTRANCE_STATUSES, `${path}.status`, "RECRUITMENT_ENTRANCE_STATUS_INVALID", add);
    timestamp(entrance.capturedAt, `${path}.capturedAt`, "RECRUITMENT_ENTRANCE_CAPTURED_AT_INVALID", add);
    date(entrance.verifiedAt, `${path}.verifiedAt`, "RECRUITMENT_ENTRANCE_VERIFIED_AT_INVALID", add);
    date(entrance.expiresAt, `${path}.expiresAt`, "RECRUITMENT_ENTRANCE_EXPIRES_AT_INVALID", add);
    chronological(entrance.capturedAt, entrance.verifiedAt, entrance.expiresAt, path, "RECRUITMENT_ENTRANCE", add);
    tagArray(entrance.tags, `${path}.tags`, tagIds, add);
    if (entrance.status === "active" && !hasLiveStatusSource(entrance.sourceIds, sourceIndex)) add("ACTIVE_ENTRANCE_OFFICIAL_SOURCE_REQUIRED", `${path}.sourceIds`);
    if (typeof entrance.id === "string") index.set(entrance.id, entrance);
  });
  return index;
}

/** @param {unknown} value @param {Set<unknown>} companyIds @param {Set<unknown>} roleFamilyIds @param {Map<unknown, any>} sourceIndex @param {Map<unknown, any>} entranceIndex @param {Set<unknown>} tagIds @param {(code: string, path: string) => void} add */
function validateRecords(value, companyIds, roleFamilyIds, sourceIndex, entranceIndex, tagIds, add) {
  const ids = new Set();
  if (!Array.isArray(value)) { add("RECORDS_INVALID", "$.records"); return; }
  value.forEach((record, index) => {
    const path = `$.records[${index}]`;
    if (!isRecord(record)) { add("RECORD_INVALID", path); return; }
    allowed(record, ["id", "companyId", "roleFamilyId", "roleName", "locations", "recruitmentType", "status", "entranceIds", "sourceIds", "capturedAt", "verifiedAt", "expiresAt", "evidenceRequirements", "advisorNotes", "tags", "review"], path, "RECORD_KEY_UNKNOWN", add);
    stableId(record.id, `${path}.id`, "RECORD_ID_INVALID", add);
    uniqueId(record.id, ids, `${path}.id`, "RECORD_ID_DUPLICATE", add);
    reference(record.companyId, companyIds, `${path}.companyId`, "RECORD_COMPANY_UNKNOWN", add);
    reference(record.roleFamilyId, roleFamilyIds, `${path}.roleFamilyId`, "RECORD_ROLE_FAMILY_UNKNOWN", add);
    nullableText(record.roleName, `${path}.roleName`, "RECORD_ROLE_NAME_INVALID", add);
    textArray(record.locations, `${path}.locations`, "RECORD_LOCATIONS_INVALID", add, true);
    enumValue(record.recruitmentType, RECRUITMENT_TYPES, `${path}.recruitmentType`, "RECRUITMENT_TYPE_INVALID", add);
    enumValue(record.status, COMPANY_ROLE_STATUSES, `${path}.status`, "RECORD_STATUS_INVALID", add);
    referenceArray(record.entranceIds, `${path}.entranceIds`, entranceIndex, "RECORD_ENTRANCE_IDS_INVALID", "RECORD_ENTRANCE_UNKNOWN", add, true);
    referenceArray(record.sourceIds, `${path}.sourceIds`, sourceIndex, "RECORD_SOURCE_IDS_INVALID", "RECORD_SOURCE_UNKNOWN", add);
    timestamp(record.capturedAt, `${path}.capturedAt`, "RECORD_CAPTURED_AT_INVALID", add);
    date(record.verifiedAt, `${path}.verifiedAt`, "RECORD_VERIFIED_AT_INVALID", add);
    date(record.expiresAt, `${path}.expiresAt`, "RECORD_EXPIRES_AT_INVALID", add);
    chronological(record.capturedAt, record.verifiedAt, record.expiresAt, path, "RECORD", add);
    textArray(record.evidenceRequirements, `${path}.evidenceRequirements`, "RECORD_EVIDENCE_REQUIREMENTS_INVALID", add, true);
    textArray(record.advisorNotes, `${path}.advisorNotes`, "RECORD_ADVISOR_NOTES_INVALID", add, true);
    tagArray(record.tags, `${path}.tags`, tagIds, add);
    validateReview(record.review, path, add);
    if (record.status === "open" && (typeof record.roleName !== "string" || !record.roleName.trim())) add("OPEN_RECORD_ROLE_NAME_REQUIRED", `${path}.roleName`);
    if (record.status === "open" && !hasLiveStatusSource(record.sourceIds, sourceIndex)) add("OPEN_RECORD_OFFICIAL_SOURCE_REQUIRED", `${path}.sourceIds`);
    if (Array.isArray(record.entranceIds)) record.entranceIds.forEach((entranceId, entrancePosition) => {
      const entrance = entranceIndex.get(entranceId);
      if (isRecord(entrance) && entrance.companyId !== record.companyId) add("RECORD_ENTRANCE_COMPANY_MISMATCH", `${path}.entranceIds[${entrancePosition}]`);
      if (isRecord(entrance) && entrance.recruitmentType !== record.recruitmentType) add("RECORD_ENTRANCE_TYPE_MISMATCH", `${path}.entranceIds[${entrancePosition}]`);
    });
  });
}

/** @param {unknown} value @param {string} parent @param {(code: string, path: string) => void} add */
function validateReview(value, parent, add) {
  const path = `${parent}.review`;
  if (!isRecord(value)) { add("REVIEW_INVALID", path); return; }
  allowed(value, ["status", "reviewedBy", "reviewedAt"], path, "REVIEW_KEY_UNKNOWN", add);
  enumValue(value.status, KNOWLEDGE_REVIEW_STATUSES, `${path}.status`, "REVIEW_STATUS_INVALID", add);
  nullableText(value.reviewedBy, `${path}.reviewedBy`, "REVIEWED_BY_INVALID", add);
  nullableTimestamp(value.reviewedAt, `${path}.reviewedAt`, "REVIEWED_AT_INVALID", add);
  if (value.status === "reviewed" && (typeof value.reviewedBy !== "string" || !value.reviewedBy.trim() || typeof value.reviewedAt !== "string")) add("REVIEW_DETAILS_REQUIRED", path);
  if (value.status === "draft" && (value.reviewedBy !== null || value.reviewedAt !== null)) add("DRAFT_REVIEW_DETAILS_FORBIDDEN", path);
}

/** @param {Record<string, any>} value @param {(code: string, path: string) => void} add */
function validatePublicationState(value, add) {
  if (value.status === "draft" && (value.publishedAt !== null || value.validThrough !== null)) add("DRAFT_PUBLICATION_DATES_FORBIDDEN", "$");
  if (value.status === "published") {
    if (typeof value.publishedAt !== "string" || typeof value.validThrough !== "string") add("PUBLISHED_DATES_REQUIRED", "$.");
    if (!Array.isArray(value.records) || value.records.length === 0) add("PUBLISHED_RECORDS_REQUIRED", "$.records");
    if (Array.isArray(value.records)) value.records.forEach((record, index) => {
      if (!isRecord(record) || !isRecord(record.review) || record.review.status !== "reviewed") add("PUBLISHED_RECORD_REVIEW_REQUIRED", `$.records[${index}].review.status`);
    });
  }
  if (typeof value.publishedAt === "string" && typeof value.validThrough === "string" && value.publishedAt.slice(0, 10) > value.validThrough) add("DATASET_VALIDITY_ORDER_INVALID", "$.validThrough");
}

/** @param {unknown} ids @param {Map<unknown, any>} sourceIndex */
function hasLiveStatusSource(ids, sourceIndex) {
  return Array.isArray(ids) && ids.some((id) => LIVE_STATUS_SOURCE_TYPES.has(sourceIndex.get(id)?.type));
}

/** @param {unknown} capturedAt @param {unknown} verifiedAt @param {unknown} expiresAt @param {string} path @param {string} prefix @param {(code: string, path: string) => void} add */
function chronological(capturedAt, verifiedAt, expiresAt, path, prefix, add) {
  if (typeof capturedAt === "string" && typeof verifiedAt === "string" && capturedAt.slice(0, 10) > verifiedAt) add(`${prefix}_VERIFIED_BEFORE_CAPTURE`, `${path}.verifiedAt`);
  if (typeof verifiedAt === "string" && typeof expiresAt === "string" && verifiedAt > expiresAt) add(`${prefix}_EXPIRES_BEFORE_VERIFIED`, `${path}.expiresAt`);
}

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
/** @param {unknown} value @param {Set<unknown>} ids @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function uniqueId(value, ids, path, code, add) { if (ids.has(value)) add(code, path); else if (typeof value === "string") ids.add(value); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function nullableText(value, path, code, add) { if (value !== null && (typeof value !== "string" || !value.trim())) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add @param {boolean=} allowEmpty */
function textArray(value, path, code, add, allowEmpty = false) { if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || new Set(value).size !== value.length || value.some((entry) => typeof entry !== "string" || !entry.trim())) add(code, path); }
/** @param {unknown} value @param {string} path @param {Set<unknown>} tagIds @param {(code: string, path: string) => void} add */
function tagArray(value, path, tagIds, add) { textArray(value, path, "TAGS_INVALID", add, true); if (Array.isArray(value)) value.forEach((tag, index) => { if (!tagIds.has(tag)) add("TAG_UNKNOWN", `${path}[${index}]`); }); }
/** @param {unknown} value @param {Set<unknown>} ids @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function reference(value, ids, path, code, add) { if (typeof value !== "string" || !ids.has(value)) add(code, path); }
/** @param {unknown} value @param {string} path @param {Map<unknown, any>} index @param {string} invalidCode @param {string} unknownCode @param {(code: string, path: string) => void} add @param {boolean=} allowEmpty */
function referenceArray(value, path, index, invalidCode, unknownCode, add, allowEmpty = false) { textArray(value, path, invalidCode, add, allowEmpty); if (Array.isArray(value)) value.forEach((id, position) => { if (!index.has(id)) add(unknownCode, `${path}[${position}]`); }); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function httpsUrl(value, path, code, add) { if (!isHttpsUrl(value)) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function nullableHttpsUrl(value, path, code, add) { if (value !== null && !isHttpsUrl(value)) add(code, path); }
/** @param {unknown} value */
function isHttpsUrl(value) { if (typeof value !== "string") return false; try { const url = new URL(value); return url.protocol === "https:" && Boolean(url.hostname); } catch { return false; } }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function date(value, path, code, add) { if (!isDate(value)) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function nullableDate(value, path, code, add) { if (value !== null && !isDate(value)) add(code, path); }
/** @param {unknown} value */
function isDate(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function timestamp(value, path, code, add) { if (!isTimestamp(value)) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function nullableTimestamp(value, path, code, add) { if (value !== null && !isTimestamp(value)) add(code, path); }
/** @param {unknown} value */
function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value)); }
/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
