import { validateCompanyRoleKnowledgeBase } from "./companyRoleKnowledgeBase.js";

export const COMPANY_ROLE_RECOMMENDATIONS_VERSION = "1.1.0";
export const COMPANY_ROLE_RECOMMENDATION_STATUSES = Object.freeze(["current", "needs_verification"]);

/**
 * Builds a report-ready company target pool for one selected direction.
 * Records are never assigned to permanent application tiers and never claim a
 * live vacancy. The requested recruitment type only affects display order.
 * @param {any} knowledgeBase
 * @param {{ directionId: string | null, recruitmentType?: "internship" | "campus", asOfDate?: string, limit?: number, targetLocations?: string[], excludedCompanies?: string[], excludedLocations?: string[], excludedIndustries?: string[] }} options
 */
export function createCompanyRoleRecommendations(knowledgeBase, options) {
  const validation = validateCompanyRoleKnowledgeBase(knowledgeBase);
  if (!validation.valid) throw new CompanyRoleRecommendationsError("KNOWLEDGE_BASE_INVALID", validation.errors);
  const asOfDate = options.asOfDate ?? currentChinaDate();
  if (!isStrictDate(asOfDate)) throw new CompanyRoleRecommendationsError("AS_OF_DATE_INVALID");
  const recruitmentType = options.recruitmentType ?? "internship";
  if (!new Set(["internship", "campus"]).has(recruitmentType)) throw new CompanyRoleRecommendationsError("RECRUITMENT_TYPE_INVALID");
  const limit = options.limit ?? 5;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new CompanyRoleRecommendationsError("LIMIT_INVALID");
  const targetLocations = stringArray(options.targetLocations ?? []);
  const excludedCompanies = stringArray(options.excludedCompanies ?? []);
  const excludedLocations = stringArray(options.excludedLocations ?? []);
  const excludedIndustries = stringArray(options.excludedIndustries ?? []);

  const direction = knowledgeBase.roleFamilies.find((/** @type {any} */ role) => role.id === options.directionId) ?? null;
  const companies = new Map(knowledgeBase.companies.map((/** @type {any} */ company) => [company.id, company]));
  const tagDefinitions = new Map(knowledgeBase.tagDefinitions.map((/** @type {any} */ tag) => [tag.id, tag]));
  const sources = new Map(knowledgeBase.sources.map((/** @type {any} */ source) => [source.id, source]));
  const entrances = new Map(knowledgeBase.recruitmentEntrances.map((/** @type {any} */ entrance) => [entrance.id, entrance]));
  const datasetExpired = expired(knowledgeBase.validThrough, asOfDate);
  const activeTargetLocations = targetLocations.filter((location) => !matchesAny(location, excludedLocations));

  const candidates = direction ? knowledgeBase.records
    .filter((/** @type {any} */ record) => record.roleFamilyId === direction.id)
    .filter((/** @type {any} */ record) => {
      const company = companies.get(record.companyId);
      if (!company) return false;
      if (matchesAny([company.id, company.name, ...(company.aliases ?? [])], excludedCompanies)) return false;
      const industryLabels = (company.tags ?? []).map((/** @type {string} */ tagId) => tagDefinitions.get(tagId)).filter((/** @type {any} */ tag) => tag?.category === "industry").flatMap((/** @type {any} */ tag) => [tag.id, tag.label]);
      if (matchesAny(industryLabels, excludedIndustries)) return false;
      if (record.locations?.length && record.locations.every((/** @type {string} */ location) => matchesAny(location, excludedLocations))) return false;
      return true;
    })
    .sort((/** @type {any} */ left, /** @type {any} */ right) => Number(right.recruitmentType === recruitmentType) - Number(left.recruitmentType === recruitmentType) || left.companyId.localeCompare(right.companyId))
    .slice(0, limit)
    .map((/** @type {any} */ record) => {
      const company = companies.get(record.companyId);
      const source = sources.get(record.sourceIds[0]);
      const entrance = entrances.get(record.entranceIds[0]);
      const industryTags = (company.tags ?? []).map((/** @type {string} */ tagId) => tagDefinitions.get(tagId)).filter((/** @type {any} */ tag) => tag?.category === "industry").map((/** @type {any} */ tag) => ({ id: tag.id, label: tag.label }));
      const locations = record.locations ?? [];
      const locationStatus = locations.length && activeTargetLocations.some((location) => matchesAny(location, locations)) ? "matched" : "requires_verification";
      const reasons = [
        datasetExpired ? "dataset_expired" : null,
        expired(record.expiresAt, asOfDate) ? "record_expired" : null,
        expired(source?.expiresAt, asOfDate) ? "source_expired" : null,
        expired(entrance?.expiresAt, asOfDate) ? "entrance_expired" : null,
        record.status !== "target_pool" ? "status_requires_review" : null,
        entrance?.status !== "unknown" ? "entrance_status_requires_review" : null,
      ].filter(Boolean);
      const status = reasons.length ? "needs_verification" : "current";
      return {
        id: record.id,
        company: { id: company.id, name: company.name },
        roleFamily: { id: direction.id, label: direction.label },
        industryTags,
        locations,
        targetLocations: activeTargetLocations,
        locationStatus,
        recruitmentType: record.recruitmentType,
        targetStatus: record.status,
        entrance: { label: entrance.label, url: entrance.url, status: entrance.status },
        source: { id: source.id, title: source.title, publisher: source.publisher, url: source.url, verifiedAt: source.verifiedAt, expiresAt: source.expiresAt },
        verification: { status, reasons, verifiedAt: record.verifiedAt, expiresAt: earliestDate([knowledgeBase.validThrough, record.expiresAt, source.expiresAt, entrance.expiresAt]) },
        caveat: status === "current" ? "官方招聘入口已人工核验；目标地点仅作为本次筛选条件，具体岗位、地点、批次和开放状态仍需申请前确认。" : "资料已超过复核期限，请打开官方入口自行确认岗位地点和开放状态后再加入投递清单。",
      };
    }) : [];

  const result = {
    schemaVersion: COMPANY_ROLE_RECOMMENDATIONS_VERSION,
    datasetVersion: knowledgeBase.datasetVersion,
    asOfDate,
    requestedRecruitmentType: recruitmentType,
    filters: { targetLocations: activeTargetLocations, excludedCompanies, excludedLocations, excludedIndustries },
    direction: direction ? { id: direction.id, label: direction.label } : null,
    status: !direction || !candidates.length ? "unavailable" : candidates.every((/** @type {any} */ candidate) => candidate.verification.status === "current") ? "current" : "needs_verification",
    candidates,
    disclaimer: "公司卡片是带来源的目标探索池，不是实时职位、公司排名、永久档次或录取概率；申请前必须核验具体岗位页面。",
  };
  const resultValidation = validateCompanyRoleRecommendations(result);
  if (!resultValidation.valid) throw new CompanyRoleRecommendationsError("RECOMMENDATIONS_INVALID", resultValidation.errors);
  return result;
}

/** @param {unknown} value */
export function validateCompanyRoleRecommendations(value) {
  /** @type {{ code: string, path: string }[]} */
  const errors = [];
  /** @param {string} code @param {string} path */
  const add = (code, path) => { errors.push({ code, path }); };
  if (!isRecord(value)) return { valid: false, errors: [{ code: "ROOT_INVALID", path: "$" }] };
  allowed(value, ["schemaVersion", "datasetVersion", "asOfDate", "requestedRecruitmentType", "filters", "direction", "status", "candidates", "disclaimer"], "$", "ROOT_KEY_UNKNOWN", add);
  if (value.schemaVersion !== COMPANY_ROLE_RECOMMENDATIONS_VERSION) add("SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion");
  text(value.datasetVersion, "$.datasetVersion", "DATASET_VERSION_INVALID", add);
  date(value.asOfDate, "$.asOfDate", "AS_OF_DATE_INVALID", add);
  enumValue(value.requestedRecruitmentType, ["internship", "campus"], "$.requestedRecruitmentType", "RECRUITMENT_TYPE_INVALID", add);
  validateFilters(value.filters, add);
  if (value.direction !== null) validateDirection(value.direction, add);
  enumValue(value.status, ["current", "needs_verification", "unavailable"], "$.status", "STATUS_INVALID", add);
  validateCandidates(value.candidates, add);
  text(value.disclaimer, "$.disclaimer", "DISCLAIMER_INVALID", add);
  return { valid: errors.length === 0, errors };
}

export class CompanyRoleRecommendationsError extends Error {
  /** @param {string} code @param {unknown[]=} details */
  constructor(code, details = []) { super(code); this.name = "CompanyRoleRecommendationsError"; this.code = code; this.details = details; }
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateFilters(value, add) {
  if (!isRecord(value)) { add("FILTERS_INVALID", "$.filters"); return; }
  allowed(value, ["targetLocations", "excludedCompanies", "excludedLocations", "excludedIndustries"], "$.filters", "FILTERS_KEY_UNKNOWN", add);
  textArray(value.targetLocations, "$.filters.targetLocations", add);
  textArray(value.excludedCompanies, "$.filters.excludedCompanies", add);
  textArray(value.excludedLocations, "$.filters.excludedLocations", add);
  textArray(value.excludedIndustries, "$.filters.excludedIndustries", add);
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateDirection(value, add) {
  if (!isRecord(value)) { add("DIRECTION_INVALID", "$.direction"); return; }
  allowed(value, ["id", "label"], "$.direction", "DIRECTION_KEY_UNKNOWN", add);
  text(value.id, "$.direction.id", "DIRECTION_ID_INVALID", add);
  text(value.label, "$.direction.label", "DIRECTION_LABEL_INVALID", add);
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateCandidates(value, add) {
  if (!Array.isArray(value) || value.length > 10) { add("CANDIDATES_INVALID", "$.candidates"); return; }
  const ids = new Set();
  value.forEach((candidate, index) => {
    const path = `$.candidates[${index}]`;
    if (!isRecord(candidate)) { add("CANDIDATE_INVALID", path); return; }
    allowed(candidate, ["id", "company", "roleFamily", "industryTags", "locations", "targetLocations", "locationStatus", "recruitmentType", "targetStatus", "entrance", "source", "verification", "caveat"], path, "CANDIDATE_KEY_UNKNOWN", add);
    text(candidate.id, `${path}.id`, "CANDIDATE_ID_INVALID", add);
    if (ids.has(candidate.id)) add("CANDIDATE_ID_DUPLICATE", `${path}.id`); else ids.add(candidate.id);
    objectTextPair(candidate.company, `${path}.company`, add);
    objectTextPair(candidate.roleFamily, `${path}.roleFamily`, add);
    textPairArray(candidate.industryTags, `${path}.industryTags`, add);
    textArray(candidate.locations, `${path}.locations`, add);
    textArray(candidate.targetLocations, `${path}.targetLocations`, add);
    enumValue(candidate.locationStatus, ["matched", "requires_verification"], `${path}.locationStatus`, "CANDIDATE_LOCATION_STATUS_INVALID", add);
    enumValue(candidate.recruitmentType, ["internship", "campus"], `${path}.recruitmentType`, "CANDIDATE_RECRUITMENT_TYPE_INVALID", add);
    if (candidate.targetStatus !== "target_pool") add("CANDIDATE_TARGET_STATUS_INVALID", `${path}.targetStatus`);
    validateEntrance(candidate.entrance, path, add);
    validateSource(candidate.source, path, add);
    validateVerification(candidate.verification, path, add);
    text(candidate.caveat, `${path}.caveat`, "CANDIDATE_CAVEAT_INVALID", add);
  });
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function objectTextPair(value, path, add) {
  if (!isRecord(value)) { add("TEXT_PAIR_INVALID", path); return; }
  allowed(value, ["id", value.name !== undefined ? "name" : "label"], path, "TEXT_PAIR_KEY_UNKNOWN", add);
  text(value.id, `${path}.id`, "TEXT_PAIR_ID_INVALID", add);
  text(value.name ?? value.label, `${path}.${value.name !== undefined ? "name" : "label"}`, "TEXT_PAIR_VALUE_INVALID", add);
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function textPairArray(value, path, add) {
  if (!Array.isArray(value)) { add("TEXT_PAIR_ARRAY_INVALID", path); return; }
  value.forEach((item, index) => objectTextPair(item, `${path}[${index}]`, add));
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function textArray(value, path, add) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) add("TEXT_ARRAY_INVALID", path);
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function validateEntrance(value, path, add) {
  if (!isRecord(value)) { add("ENTRANCE_INVALID", `${path}.entrance`); return; }
  allowed(value, ["label", "url", "status"], `${path}.entrance`, "ENTRANCE_KEY_UNKNOWN", add);
  text(value.label, `${path}.entrance.label`, "ENTRANCE_LABEL_INVALID", add);
  url(value.url, `${path}.entrance.url`, "ENTRANCE_URL_INVALID", add);
  if (value.status !== "unknown") add("ENTRANCE_STATUS_INVALID", `${path}.entrance.status`);
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function validateSource(value, path, add) {
  if (!isRecord(value)) { add("SOURCE_INVALID", `${path}.source`); return; }
  allowed(value, ["id", "title", "publisher", "url", "verifiedAt", "expiresAt"], `${path}.source`, "SOURCE_KEY_UNKNOWN", add);
  ["id", "title", "publisher"].forEach((field) => text(value[field], `${path}.source.${field}`, "SOURCE_TEXT_INVALID", add));
  url(value.url, `${path}.source.url`, "SOURCE_URL_INVALID", add);
  date(value.verifiedAt, `${path}.source.verifiedAt`, "SOURCE_VERIFIED_AT_INVALID", add);
  date(value.expiresAt, `${path}.source.expiresAt`, "SOURCE_EXPIRES_AT_INVALID", add);
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function validateVerification(value, path, add) {
  if (!isRecord(value)) { add("VERIFICATION_INVALID", `${path}.verification`); return; }
  allowed(value, ["status", "reasons", "verifiedAt", "expiresAt"], `${path}.verification`, "VERIFICATION_KEY_UNKNOWN", add);
  enumValue(value.status, COMPANY_ROLE_RECOMMENDATION_STATUSES, `${path}.verification.status`, "VERIFICATION_STATUS_INVALID", add);
  if (!Array.isArray(value.reasons) || value.reasons.some((reason) => typeof reason !== "string" || !reason)) add("VERIFICATION_REASONS_INVALID", `${path}.verification.reasons`);
  date(value.verifiedAt, `${path}.verification.verifiedAt`, "VERIFICATION_DATE_INVALID", add);
  date(value.expiresAt, `${path}.verification.expiresAt`, "VERIFICATION_EXPIRY_INVALID", add);
}

/** @param {(string | null | undefined)[]} values */
function earliestDate(values) { return values.filter((value) => typeof value === "string").sort()[0]; }
/** @param {string | null | undefined} expiryDate @param {string} asOfDate */
function expired(expiryDate, asOfDate) { return typeof expiryDate === "string" && asOfDate > expiryDate; }
function currentChinaDate() { const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map(({ type, value }) => [type, value])); return `${values.year}-${values.month}-${values.day}`; }
/** @param {unknown} value */
function stringArray(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new CompanyRoleRecommendationsError("FILTER_INVALID");
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}
/** @param {string | string[]} values @param {string[]} terms */
function matchesAny(values, terms) {
  const candidates = (Array.isArray(values) ? values : [values]).map(normalizeTerm).filter(Boolean);
  return terms.map(normalizeTerm).filter(Boolean).some((term) => candidates.some((candidate) => candidate.includes(term) || term.includes(candidate)));
}
/** @param {string} value */
function normalizeTerm(value) { return String(value ?? "").toLocaleLowerCase("zh-CN").replace(/[\s·•._-]+/g, ""); }
/** @param {unknown} value */
function isStrictDate(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function date(value, path, code, add) { if (!isStrictDate(value)) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function text(value, path, code, add) { if (typeof value !== "string" || !value.trim()) add(code, path); }
/** @param {unknown} value @param {readonly string[]} values @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function enumValue(value, values, path, code, add) { if (!values.includes(/** @type {never} */ (value))) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function url(value, path, code, add) { try { if (typeof value !== "string" || new URL(value).protocol !== "https:") add(code, path); } catch { add(code, path); } }
/** @param {Record<string, unknown>} value @param {string[]} keys @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function allowed(value, keys, path, code, add) { Object.keys(value).forEach((key) => { if (!keys.includes(key)) add(code, `${path}.${key}`); }); }
/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
