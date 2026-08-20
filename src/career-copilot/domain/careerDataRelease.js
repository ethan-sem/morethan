export const CAREER_DATA_RELEASE_VERSION = "1.0.0";
export const CAREER_DATA_RELEASE_FILE_KEYS = Object.freeze(["companyRolePool", "sourceWhitelist", "roleFamilyMap"]);
export const CAREER_DATA_RELEASE_CHECKS = Object.freeze([
  "official_sources_opened",
  "facts_match_sources",
  "dates_and_expiry_checked",
  "no_live_vacancy_overclaim",
  "no_tiers_scores_or_probabilities",
  "privacy_and_usage_policy_checked",
]);

/**
 * Creates the local, human-reviewed release manifest. Operator names are local
 * audit labels, not accounts or authentication identities.
 * @param {{ releaseId: string, editor: string, asOfDate: string, createdAt: string, dataFiles: { key: string, fileName: string, sha256: string }[] }} input
 */
export function createCareerDataRelease(input) {
  const result = {
    schemaVersion: CAREER_DATA_RELEASE_VERSION,
    releaseId: input.releaseId,
    status: "draft",
    asOfDate: input.asOfDate,
    createdAt: input.createdAt,
    editor: { name: input.editor, confirmedAt: input.createdAt },
    dataFiles: input.dataFiles.map((file) => ({ ...file })),
    validation: { status: "pending", checkedAt: null, errorCount: null },
    reviews: [],
    publication: null,
  };
  const validation = validateCareerDataRelease(result);
  if (!validation.valid) throw new CareerDataReleaseError("RELEASE_INVALID", validation.errors);
  return result;
}

/**
 * Adds a completed six-point review. Two independent approvals are required.
 * @param {any} manifest
 * @param {{ reviewer: string, reviewedAt: string, validationCheckedAt: string, checks: string[], dataFiles: { key: string, fileName: string, sha256: string }[] }} input
 */
export function approveCareerDataRelease(manifest, input) {
  assertCareerDataRelease(manifest);
  if (manifest.status === "published") throw new CareerDataReleaseError("RELEASE_ALREADY_PUBLISHED");
  if (manifest.editor.name === input.reviewer) throw new CareerDataReleaseError("EDITOR_CANNOT_REVIEW");
  if (manifest.reviews.some((/** @type {any} */ review) => review.reviewer === input.reviewer)) throw new CareerDataReleaseError("REVIEWER_DUPLICATE");
  if (!sameSet(input.checks, CAREER_DATA_RELEASE_CHECKS)) throw new CareerDataReleaseError("REVIEW_CHECKLIST_INCOMPLETE");
  if (!sameFileHashes(input.dataFiles, manifest.dataFiles)) throw new CareerDataReleaseError("FILES_CHANGED_BEFORE_REVIEW");
  const reviews = [...manifest.reviews, { reviewer: input.reviewer, decision: "approved", reviewedAt: input.reviewedAt, checks: [...input.checks], dataFileHashes: input.dataFiles.map((file) => ({ key: file.key, sha256: file.sha256 })) }];
  const result = {
    ...manifest,
    status: reviews.length >= 2 ? "approved" : "in_review",
    validation: { status: "passed", checkedAt: input.validationCheckedAt, errorCount: 0 },
    reviews,
  };
  assertCareerDataRelease(result);
  return result;
}

/**
 * Records a guarded local publication after file hashes and validation pass.
 * @param {any} manifest
 * @param {{ publisher: string, publishedAt: string, backupDirectory: string, dataFiles: { key: string, fileName: string, sha256: string }[] }} input
 */
export function publishCareerDataRelease(manifest, input) {
  assertCareerDataRelease(manifest);
  if (manifest.status !== "approved" || manifest.reviews.length < 2) throw new CareerDataReleaseError("RELEASE_NOT_APPROVED");
  if (!sameFileHashes(input.dataFiles, manifest.dataFiles)) throw new CareerDataReleaseError("FILES_CHANGED_AFTER_REVIEW");
  const result = {
    ...manifest,
    status: "published",
    publication: { publisher: input.publisher, publishedAt: input.publishedAt, backupDirectory: input.backupDirectory, dataFileHashes: input.dataFiles.map((file) => ({ key: file.key, sha256: file.sha256 })) },
  };
  assertCareerDataRelease(result);
  return result;
}

/** @param {unknown} value */
export function validateCareerDataRelease(value) {
  /** @type {{ code: string, path: string }[]} */
  const errors = [];
  /** @param {string} code @param {string} path */
  const add = (code, path) => { errors.push({ code, path }); };
  if (!isRecord(value)) return { valid: false, errors: [{ code: "ROOT_INVALID", path: "$" }] };
  allowed(value, ["schemaVersion", "releaseId", "status", "asOfDate", "createdAt", "editor", "dataFiles", "validation", "reviews", "publication"], "$", "ROOT_KEY_UNKNOWN", add);
  if (value.schemaVersion !== CAREER_DATA_RELEASE_VERSION) add("SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion");
  if (typeof value.releaseId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.releaseId)) add("RELEASE_ID_INVALID", "$.releaseId");
  enumValue(value.status, ["draft", "in_review", "approved", "published"], "$.status", "STATUS_INVALID", add);
  date(value.asOfDate, "$.asOfDate", "AS_OF_DATE_INVALID", add);
  timestamp(value.createdAt, "$.createdAt", "CREATED_AT_INVALID", add);
  validateEditor(value.editor, add);
  validateDataFiles(value.dataFiles, "$.dataFiles", add, true);
  validateValidation(value.validation, add);
  validateReviews(value.reviews, value.editor, add);
  validatePublication(value.publication, value.status, add);
  validateHashConsistency(value.dataFiles, value.reviews, value.publication, add);
  if (value.status === "draft" && Array.isArray(value.reviews) && value.reviews.length) add("DRAFT_REVIEWS_FORBIDDEN", "$.reviews");
  if (value.status === "in_review" && (!Array.isArray(value.reviews) || value.reviews.length !== 1)) add("IN_REVIEW_COUNT_INVALID", "$.reviews");
  if (["approved", "published"].includes(value.status) && (!Array.isArray(value.reviews) || value.reviews.length < 2)) add("APPROVALS_REQUIRED", "$.reviews");
  return { valid: errors.length === 0, errors };
}

/** @param {unknown} value */
export function assertCareerDataRelease(value) {
  const validation = validateCareerDataRelease(value);
  if (!validation.valid) throw new CareerDataReleaseError("RELEASE_INVALID", validation.errors);
  return value;
}

export class CareerDataReleaseError extends Error {
  /** @param {string} code @param {unknown[]=} details */
  constructor(code, details = []) { super(code); this.name = "CareerDataReleaseError"; this.code = code; this.details = details; }
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateEditor(value, add) {
  if (!isRecord(value)) { add("EDITOR_INVALID", "$.editor"); return; }
  allowed(value, ["name", "confirmedAt"], "$.editor", "EDITOR_KEY_UNKNOWN", add);
  text(value.name, "$.editor.name", "EDITOR_NAME_INVALID", add);
  timestamp(value.confirmedAt, "$.editor.confirmedAt", "EDITOR_CONFIRMED_AT_INVALID", add);
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add @param {boolean} requireFileName */
function validateDataFiles(value, path, add, requireFileName) {
  if (!Array.isArray(value) || value.length !== CAREER_DATA_RELEASE_FILE_KEYS.length) { add("DATA_FILES_INVALID", path); return; }
  const keys = new Set();
  value.forEach((file, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(file)) { add("DATA_FILE_INVALID", itemPath); return; }
    allowed(file, requireFileName ? ["key", "fileName", "sha256"] : ["key", "sha256"], itemPath, "DATA_FILE_KEY_UNKNOWN", add);
    enumValue(file.key, CAREER_DATA_RELEASE_FILE_KEYS, `${itemPath}.key`, "DATA_FILE_TYPE_INVALID", add);
    if (keys.has(file.key)) add("DATA_FILE_TYPE_DUPLICATE", `${itemPath}.key`); else keys.add(file.key);
    if (requireFileName) text(file.fileName, `${itemPath}.fileName`, "DATA_FILE_NAME_INVALID", add);
    if (typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)) add("DATA_FILE_HASH_INVALID", `${itemPath}.sha256`);
  });
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateValidation(value, add) {
  if (!isRecord(value)) { add("VALIDATION_INVALID", "$.validation"); return; }
  allowed(value, ["status", "checkedAt", "errorCount"], "$.validation", "VALIDATION_KEY_UNKNOWN", add);
  enumValue(value.status, ["pending", "passed"], "$.validation.status", "VALIDATION_STATUS_INVALID", add);
  if (value.status === "pending" && (value.checkedAt !== null || value.errorCount !== null)) add("PENDING_VALIDATION_DETAILS_FORBIDDEN", "$.validation");
  if (value.status === "passed") {
    timestamp(value.checkedAt, "$.validation.checkedAt", "VALIDATION_CHECKED_AT_INVALID", add);
    if (value.errorCount !== 0) add("VALIDATION_ERROR_COUNT_INVALID", "$.validation.errorCount");
  }
}

/** @param {unknown} value @param {unknown} editor @param {(code: string, path: string) => void} add */
function validateReviews(value, editor, add) {
  if (!Array.isArray(value) || value.length > 2) { add("REVIEWS_INVALID", "$.reviews"); return; }
  const reviewers = new Set();
  value.forEach((review, index) => {
    const path = `$.reviews[${index}]`;
    if (!isRecord(review)) { add("REVIEW_INVALID", path); return; }
    allowed(review, ["reviewer", "decision", "reviewedAt", "checks", "dataFileHashes"], path, "REVIEW_KEY_UNKNOWN", add);
    text(review.reviewer, `${path}.reviewer`, "REVIEWER_INVALID", add);
    if (isRecord(editor) && review.reviewer === editor.name) add("EDITOR_REVIEW_FORBIDDEN", `${path}.reviewer`);
    if (reviewers.has(review.reviewer)) add("REVIEWER_DUPLICATE", `${path}.reviewer`); else reviewers.add(review.reviewer);
    if (review.decision !== "approved") add("REVIEW_DECISION_INVALID", `${path}.decision`);
    timestamp(review.reviewedAt, `${path}.reviewedAt`, "REVIEWED_AT_INVALID", add);
    if (!sameSet(review.checks, CAREER_DATA_RELEASE_CHECKS)) add("REVIEW_CHECKLIST_INCOMPLETE", `${path}.checks`);
    validateDataFiles(review.dataFileHashes, `${path}.dataFileHashes`, add, false);
  });
}

/** @param {unknown} value @param {unknown} status @param {(code: string, path: string) => void} add */
function validatePublication(value, status, add) {
  if (status !== "published") { if (value !== null) add("PUBLICATION_FORBIDDEN", "$.publication"); return; }
  if (!isRecord(value)) { add("PUBLICATION_REQUIRED", "$.publication"); return; }
  allowed(value, ["publisher", "publishedAt", "backupDirectory", "dataFileHashes"], "$.publication", "PUBLICATION_KEY_UNKNOWN", add);
  text(value.publisher, "$.publication.publisher", "PUBLISHER_INVALID", add);
  timestamp(value.publishedAt, "$.publication.publishedAt", "PUBLISHED_AT_INVALID", add);
  text(value.backupDirectory, "$.publication.backupDirectory", "BACKUP_DIRECTORY_INVALID", add);
  validateDataFiles(value.dataFileHashes, "$.publication.dataFileHashes", add, false);
}

/** @param {unknown} dataFiles @param {unknown} reviews @param {unknown} publication @param {(code: string, path: string) => void} add */
function validateHashConsistency(dataFiles, reviews, publication, add) {
  if (!Array.isArray(dataFiles)) return;
  if (Array.isArray(reviews)) reviews.forEach((review, index) => {
    if (isRecord(review) && Array.isArray(review.dataFileHashes) && !sameFileHashes(review.dataFileHashes, dataFiles)) add("REVIEW_HASH_MISMATCH", `$.reviews[${index}].dataFileHashes`);
  });
  if (isRecord(publication) && Array.isArray(publication.dataFileHashes) && !sameFileHashes(publication.dataFileHashes, dataFiles)) add("PUBLICATION_HASH_MISMATCH", "$.publication.dataFileHashes");
}

/** @param {unknown} left @param {readonly string[]} right */
function sameSet(left, right) { return Array.isArray(left) && left.length === right.length && right.every((value) => left.includes(value)) && new Set(left).size === left.length; }
/** @param {any[]} left @param {any[]} right */
function sameFileHashes(left, right) { return Array.isArray(left) && Array.isArray(right) && CAREER_DATA_RELEASE_FILE_KEYS.every((key) => left.find((file) => file.key === key)?.sha256 === right.find((file) => file.key === key)?.sha256); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function text(value, path, code, add) { if (typeof value !== "string" || !value.trim()) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function date(value, path, code, add) { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) add(code, path); }
/** @param {unknown} value @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function timestamp(value, path, code, add) { if (typeof value !== "string" || !value.includes("T") || Number.isNaN(Date.parse(value))) add(code, path); }
/** @param {unknown} value @param {readonly string[]} values @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function enumValue(value, values, path, code, add) { if (!values.includes(/** @type {never} */ (value))) add(code, path); }
/** @param {Record<string, unknown>} value @param {string[]} keys @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function allowed(value, keys, path, code, add) { Object.keys(value).forEach((key) => { if (!keys.includes(key)) add(code, `${path}.${key}`); }); }
/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
