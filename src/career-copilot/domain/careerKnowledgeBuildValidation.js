import { validateCompanyRoleKnowledgeBase } from "./companyRoleKnowledgeBase.js";
import { validateRoleFamilyMap } from "./roleFamilyMap.js";
import { findWhitelistedSource, validateSourceWhitelist } from "./sourceWhitelist.js";
import { ROLE_PROFILES } from "./roleProfiles.js";

export const CAREER_KNOWLEDGE_BUILD_VALIDATION_VERSION = "1.1.0";

/** @typedef {{ dataset: "companyRolePool" | "sourceWhitelist" | "roleFamilyMap", code: string, path: string, message: string }} CareerKnowledgeBuildError */
/** @typedef {{ companyRolePool: any, sourceWhitelist: any, roleFamilyMap: any }} CareerKnowledgeFiles */

/**
 * Runs the complete M5 build gate without mutating the supplied JSON values.
 * Dates are inclusive: a record with expiresAt 2026-08-20 remains usable on
 * that date and becomes expired on 2026-08-21.
 * @param {CareerKnowledgeFiles} files
 * @param {{ asOfDate?: string }=} options
 * @returns {{ valid: boolean, version: string, asOfDate: string, errors: CareerKnowledgeBuildError[], warnings: CareerKnowledgeBuildError[], summary: { companies: number, companyRoleRecords: number, whitelistedSources: number, directions: number, detailedRoleFamilies: number } }}
 */
export function validateCareerKnowledgeBuild(files, options = {}) {
  const asOfDate = options.asOfDate ?? currentChinaDate();
  /** @type {CareerKnowledgeBuildError[]} */
  const errors = [];
  /** @type {CareerKnowledgeBuildError[]} */
  const warnings = [];
  /** @param {CareerKnowledgeBuildError["dataset"]} dataset @param {string} code @param {string} path @param {string} message */
  const add = (dataset, code, path, message) => { errors.push({ dataset, code, path, message }); };

  if (!isStrictDate(asOfDate)) {
    add("companyRolePool", "AS_OF_DATE_INVALID", "$build.asOfDate", "验收日期必须是合法的 YYYY-MM-DD。 ");
    return result(asOfDate, files, errors, warnings);
  }

  const poolValidation = validateCompanyRoleKnowledgeBase(files?.companyRolePool);
  const whitelistValidation = validateSourceWhitelist(files?.sourceWhitelist);
  const roleMapValidation = validateRoleFamilyMap(files?.roleFamilyMap);
  appendSchemaErrors("companyRolePool", poolValidation.errors, errors);
  appendSchemaErrors("sourceWhitelist", whitelistValidation.errors, errors);
  appendSchemaErrors("roleFamilyMap", roleMapValidation.errors, errors);

  /** @param {CareerKnowledgeBuildError["dataset"]} dataset @param {string} code @param {string} path @param {string} message */
  const warn = (dataset, code, path, message) => { warnings.push({ dataset, code, path, message }); };
  if (poolValidation.valid) validatePoolRelease(files.companyRolePool, files.sourceWhitelist, whitelistValidation.valid, asOfDate, add, warn);
  if (whitelistValidation.valid) validateWhitelistFreshness(files.sourceWhitelist, asOfDate, add, warn);
  if (roleMapValidation.valid) validateRoleMapRelease(files.roleFamilyMap, asOfDate, add, warn);
  if (poolValidation.valid && roleMapValidation.valid) validateCrossDatasetDirections(files.companyRolePool, files.roleFamilyMap, add);

  return result(asOfDate, files, errors, warnings);
}

/** @param {any} pool @param {any} whitelist @param {boolean} whitelistValid @param {string} asOfDate @param {(dataset: CareerKnowledgeBuildError["dataset"], code: string, path: string, message: string) => void} add @param {(dataset: CareerKnowledgeBuildError["dataset"], code: string, path: string, message: string) => void} warn */
function validatePoolRelease(pool, whitelist, whitelistValid, asOfDate, add, warn) {
  if (pool.status !== "published") add("companyRolePool", "DATASET_NOT_PUBLISHED", "$.status", "生产构建只接受已发布的公司岗位数据包。");
  expired(pool.validThrough, asOfDate, "companyRolePool", "DATASET_EXPIRED", "$.validThrough", warn);
  if (pool.companies.length !== 30) add("companyRolePool", "COMPANY_COUNT_INVALID", "$.companies", "首发目标池必须恰好包含 30 家公司。");
  if (pool.records.length !== 30) add("companyRolePool", "RECORD_COUNT_INVALID", "$.records", "首发目标池必须恰好包含 30 条公司岗位方向记录。");

  pool.sources.forEach((/** @type {any} */ source, /** @type {number} */ index) => {
    expired(source.expiresAt, asOfDate, "companyRolePool", "SOURCE_EXPIRED", `$.sources[${index}].expiresAt`, warn);
    if (whitelistValid && !findWhitelistedSource(source.url, whitelist)) add("companyRolePool", "SOURCE_NOT_WHITELISTED", `$.sources[${index}].url`, "公司岗位来源 URL 未命中来源白名单。");
  });
  pool.recruitmentEntrances.forEach((/** @type {any} */ entrance, /** @type {number} */ index) => {
    expired(entrance.expiresAt, asOfDate, "companyRolePool", "ENTRANCE_EXPIRED", `$.recruitmentEntrances[${index}].expiresAt`, warn);
    if (whitelistValid && !findWhitelistedSource(entrance.url, whitelist)) add("companyRolePool", "ENTRANCE_NOT_WHITELISTED", `$.recruitmentEntrances[${index}].url`, "招聘入口 URL 未命中来源白名单。");
  });
  pool.records.forEach((/** @type {any} */ record, /** @type {number} */ index) => expired(record.expiresAt, asOfDate, "companyRolePool", "RECORD_EXPIRED", `$.records[${index}].expiresAt`, warn));
  pool.companies.forEach((/** @type {any} */ company, /** @type {number} */ index) => {
    if (whitelistValid && company.websiteUrl && !findWhitelistedSource(company.websiteUrl, whitelist)) add("companyRolePool", "COMPANY_URL_NOT_WHITELISTED", `$.companies[${index}].websiteUrl`, "公司招聘 URL 未命中来源白名单。");
  });

  const directionCounts = countBy(pool.records, "roleFamilyId");
  pool.roleFamilies.forEach((/** @type {any} */ role, /** @type {number} */ index) => {
    if ((directionCounts.get(role.id) ?? 0) < 5) add("companyRolePool", "DIRECTION_COVERAGE_INSUFFICIENT", `$.roleFamilies[${index}].id`, "每个首发方向必须至少覆盖 5 家公司。");
  });
}

/** @param {any} whitelist @param {string} asOfDate @param {(dataset: CareerKnowledgeBuildError["dataset"], code: string, path: string, message: string) => void} add @param {(dataset: CareerKnowledgeBuildError["dataset"], code: string, path: string, message: string) => void} warn */
function validateWhitelistFreshness(whitelist, asOfDate, add, warn) {
  if (whitelist.status !== "published") add("sourceWhitelist", "REGISTRY_NOT_PUBLISHED", "$.status", "生产构建只接受已发布的来源白名单。");
  whitelist.sources.forEach((/** @type {any} */ source, /** @type {number} */ index) => {
    const reviewDueDate = addUtcDays(source.verifiedAt, source.reviewIntervalDays);
    if (reviewDueDate && asOfDate > reviewDueDate) warn("sourceWhitelist", "SOURCE_REVIEW_OVERDUE", `$.sources[${index}].verifiedAt`, `来源已超过 ${source.reviewIntervalDays} 天复核周期；构建保留，但运行时必须标记为待自行核实。`);
  });
}

/** @param {any} roleMap @param {string} asOfDate @param {(dataset: CareerKnowledgeBuildError["dataset"], code: string, path: string, message: string) => void} add @param {(dataset: CareerKnowledgeBuildError["dataset"], code: string, path: string, message: string) => void} warn */
function validateRoleMapRelease(roleMap, asOfDate, add, warn) {
  if (roleMap.status !== "published") add("roleFamilyMap", "MAPPING_NOT_PUBLISHED", "$.status", "生产构建只接受已发布的岗位族映射表。");
  expired(roleMap.validThrough, asOfDate, "roleFamilyMap", "MAPPING_EXPIRED", "$.validThrough", warn);
  if (roleMap.directions.length !== 6) add("roleFamilyMap", "DIRECTION_COUNT_INVALID", "$.directions", "首发映射表必须包含六个求职方向。");
  if (roleMap.roleFamilies.length !== 18) add("roleFamilyMap", "ROLE_FAMILY_COUNT_INVALID", "$.roleFamilies", "首发映射表必须包含 18 个细分岗位族。");
  roleMap.directions.forEach((/** @type {any} */ direction, /** @type {number} */ index) => {
    if (direction.roleFamilyIds.length !== 3) add("roleFamilyMap", "DIRECTION_ROLE_COUNT_INVALID", `$.directions[${index}].roleFamilyIds`, "每个首发方向必须映射三个细分岗位族。");
  });
}

/** @param {any} pool @param {any} roleMap @param {(dataset: CareerKnowledgeBuildError["dataset"], code: string, path: string, message: string) => void} add */
function validateCrossDatasetDirections(pool, roleMap, add) {
  const poolDirectionIds = new Set(pool.roleFamilies.map((/** @type {any} */ role) => role.id));
  const mappingDirectionIds = new Set(roleMap.directions.map((/** @type {any} */ direction) => direction.id));
  const profileIds = new Set(ROLE_PROFILES.map(({ id }) => id));
  const allIds = new Set([...poolDirectionIds, ...mappingDirectionIds, ...profileIds]);
  allIds.forEach((id) => {
    if (!poolDirectionIds.has(id) || !mappingDirectionIds.has(id) || !profileIds.has(id)) add("roleFamilyMap", "DIRECTION_SET_MISMATCH", "$.directions", `方向 ${id} 未同时存在于目标池、岗位映射和分析画像。`);
  });
  roleMap.directions.forEach((/** @type {any} */ direction, /** @type {number} */ index) => {
    if (direction.profileId !== direction.id) add("roleFamilyMap", "DIRECTION_PROFILE_MISMATCH", `$.directions[${index}].profileId`, "当前首发方向的 profileId 必须与方向稳定 ID 一致。");
  });
}

/** @param {CareerKnowledgeBuildError["dataset"]} dataset @param {{ code: string, path: string }[]} schemaErrors @param {CareerKnowledgeBuildError[]} errors */
function appendSchemaErrors(dataset, schemaErrors, errors) {
  schemaErrors.forEach(({ code, path }) => errors.push({ dataset, code: `SCHEMA_${code}`, path, message: "静态数据未通过关闭式 Schema 校验。" }));
}

/** @param {string | null | undefined} expiryDate @param {string} asOfDate @param {CareerKnowledgeBuildError["dataset"]} dataset @param {string} code @param {string} path @param {(dataset: CareerKnowledgeBuildError["dataset"], code: string, path: string, message: string) => void} add */
function expired(expiryDate, asOfDate, dataset, code, path, add) {
  if (typeof expiryDate === "string" && isStrictDate(expiryDate) && asOfDate > expiryDate) add(dataset, code, path, `数据已于 ${expiryDate} 到期；构建保留来源，运行时必须降级为待自行核实。`);
}

/** @param {string} date @param {number} days */
function addUtcDays(date, days) {
  if (!isStrictDate(date) || !Number.isInteger(days)) return null;
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** @param {any[]} values @param {string} key */
function countBy(values, key) {
  const counts = new Map();
  values.forEach((value) => counts.set(value[key], (counts.get(value[key]) ?? 0) + 1));
  return counts;
}

/** @param {string} value */
function isStrictDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function currentChinaDate() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** @param {string} asOfDate @param {CareerKnowledgeFiles} files @param {CareerKnowledgeBuildError[]} errors @param {CareerKnowledgeBuildError[]} warnings */
function result(asOfDate, files, errors, warnings) {
  return {
    valid: errors.length === 0,
    version: CAREER_KNOWLEDGE_BUILD_VALIDATION_VERSION,
    asOfDate,
    errors,
    warnings,
    summary: {
      companies: arrayLength(files?.companyRolePool?.companies),
      companyRoleRecords: arrayLength(files?.companyRolePool?.records),
      whitelistedSources: arrayLength(files?.sourceWhitelist?.sources),
      directions: arrayLength(files?.roleFamilyMap?.directions),
      detailedRoleFamilies: arrayLength(files?.roleFamilyMap?.roleFamilies),
    },
  };
}

/** @param {unknown} value */
function arrayLength(value) { return Array.isArray(value) ? value.length : 0; }
