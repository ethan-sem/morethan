export const RESUME_FACTS_SCHEMA_VERSION = "1.0.0";

export const RESUME_FACT_CATEGORIES = Object.freeze([
  "education",
  "internship",
  "project",
  "campus",
  "skill",
  "certification",
  "achievement",
]);

export const FACT_CONFIDENCE_LEVELS = Object.freeze(["high", "medium", "low"]);
export const FACT_REVIEW_STATUSES = Object.freeze(["pending", "confirmed", "excluded", "uncertain"]);
export const FACT_PROVENANCE_TYPES = Object.freeze(["extracted", "user_added", "user_edited"]);
export const RESUME_REVIEW_STATUSES = Object.freeze(["not_started", "in_progress", "completed"]);
export const RESUME_SOURCE_FORMATS = Object.freeze(["pdf", "docx", "txt", "paste", "manual"]);
export const PRIVATE_FIELD_TYPES = Object.freeze(["name", "phone", "email", "address", "id_number", "other"]);
export const PRIVATE_FIELD_REVIEW_STATUSES = Object.freeze(["detected", "confirmed", "dismissed"]);
export const TIMELINE_FLAG_TYPES = Object.freeze(["date_overlap", "date_invalid", "date_missing", "date_conflict"]);
export const TIMELINE_FLAG_STATUSES = Object.freeze(["open", "confirmed", "dismissed"]);

/** @typedef {"education" | "internship" | "project" | "campus" | "skill" | "certification" | "achievement"} ResumeFactCategory */
/** @typedef {"high" | "medium" | "low"} FactConfidenceLevel */
/** @typedef {"pending" | "confirmed" | "excluded" | "uncertain"} FactReviewStatus */
/** @typedef {"extracted" | "user_added" | "user_edited"} FactProvenance */
/** @typedef {"pdf" | "docx" | "txt" | "paste" | "manual"} ResumeSourceFormat */
/** @typedef {{ value: string | null, precision: "year" | "month" | "day" | "unknown" }} NormalizedDate */
/** @typedef {{ start: NormalizedDate | null, end: NormalizedDate | null, ongoing: boolean }} ResumeDateRange */
/** @typedef {{ documentId: string, startOffset: number, endOffset: number, page: number | null, section: string | null }} FactSourceRef */
/** @typedef {{ level: FactConfidenceLevel, score: number | null, reasons: string[] }} FactConfidence */
/** @typedef {{ status: FactReviewStatus, updatedAt: string | null }} FactReview */
/** @typedef {{ id: string, category: ResumeFactCategory, data: Record<string, unknown>, sourceRefs: FactSourceRef[], confidence: FactConfidence, review: FactReview, provenance: FactProvenance }} ResumeFact */
/** @typedef {{ id: string, type: typeof PRIVATE_FIELD_TYPES[number], maskedValue: string, sourceRefs: FactSourceRef[], confidence: FactConfidenceLevel, reviewStatus: typeof PRIVATE_FIELD_REVIEW_STATUSES[number] }} ResumePrivateField */
/** @typedef {{ id: string, type: typeof TIMELINE_FLAG_TYPES[number], factIds: string[], status: typeof TIMELINE_FLAG_STATUSES[number], messageKey: string }} ResumeTimelineFlag */
/** @typedef {{ schemaVersion: string, document: { id: string, format: ResumeSourceFormat, characterCount: number, textLength: number }, facts: ResumeFact[], privateFields: ResumePrivateField[], timelineFlags: ResumeTimelineFlag[], review: { status: typeof RESUME_REVIEW_STATUSES[number], reviewedAt: string | null }, createdAt: string, updatedAt: string }} ResumeFacts */
/** @typedef {{ code: string, path: string }} ResumeFactsValidationError */

const DATA_FACTORIES = Object.freeze(/** @type {Record<ResumeFactCategory, () => Record<string, unknown>>} */ ({
  education: () => ({ institution: null, degree: null, major: null, dateRange: null, highlights: [] }),
  internship: () => ({ organization: null, role: null, location: null, dateRange: null, actions: [], methods: [], results: [], metrics: [] }),
  project: () => ({ name: null, role: null, dateRange: null, actions: [], methods: [], results: [], metrics: [], technologies: [] }),
  campus: () => ({ organization: null, role: null, dateRange: null, actions: [], results: [] }),
  skill: () => ({ name: null, level: null, keywords: [], evidenceFactIds: [] }),
  certification: () => ({ name: null, issuer: null, issuedAt: null, expiresAt: null, credentialId: null }),
  achievement: () => ({ title: null, issuer: null, receivedAt: null, level: null, description: null }),
}));

const REQUIRED_DATA_KEYS = Object.freeze(Object.fromEntries(
  Object.entries(DATA_FACTORIES).map(([category, factory]) => [category, Object.keys(factory())]),
));

const NORMALIZED_DATE_FIELDS = Object.freeze({
  certification: ["issuedAt", "expiresAt"],
  achievement: ["receivedAt"],
});

/**
 * Creates a mutable, memory-only ResumeFacts v1 document without retaining resume text.
 * @param {{ documentId: string, format: ResumeSourceFormat, characterCount: number, textLength: number, now?: string }} input
 * @returns {ResumeFacts}
 */
export function createEmptyResumeFacts(input) {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: RESUME_FACTS_SCHEMA_VERSION,
    document: { id: input.documentId, format: input.format, characterCount: input.characterCount, textLength: input.textLength },
    facts: [],
    privateFields: [],
    timelineFlags: [],
    review: { status: "not_started", reviewedAt: null },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates one canonical fact. Callers provide IDs so extraction remains deterministic and testable.
 * @param {{ id: string, category: ResumeFactCategory, data?: Record<string, unknown>, sourceRefs?: FactSourceRef[], confidence?: Partial<FactConfidence>, review?: Partial<FactReview>, provenance?: FactProvenance }} input
 * @returns {ResumeFact}
 */
export function createResumeFact(input) {
  const factory = DATA_FACTORIES[input.category];
  if (!factory) throw new ResumeFactsModelError("FACT_CATEGORY_UNSUPPORTED");
  return {
    id: input.id,
    category: input.category,
    data: mergeFactData(factory(), input.data ?? {}),
    sourceRefs: (input.sourceRefs ?? []).map((sourceRef) => ({ ...sourceRef })),
    confidence: {
      level: input.confidence?.level ?? "low",
      score: input.confidence?.score ?? null,
      reasons: [...(input.confidence?.reasons ?? [])],
    },
    review: {
      status: input.review?.status ?? "pending",
      updatedAt: input.review?.updatedAt ?? null,
    },
    provenance: input.provenance ?? "extracted",
  };
}

/** @param {unknown} value @returns {{ valid: boolean, errors: ResumeFactsValidationError[] }} */
export function validateResumeFacts(value) {
  /** @type {ResumeFactsValidationError[]} */
  const errors = [];
  /** @param {string} code @param {string} path */
  const add = (code, path) => errors.push({ code, path });
  if (!isRecord(value)) return { valid: false, errors: [{ code: "ROOT_INVALID", path: "$" }] };

  validateAllowedKeys(value, ["schemaVersion", "document", "facts", "privateFields", "timelineFlags", "review", "createdAt", "updatedAt"], "$", "ROOT_KEY_UNKNOWN", add);
  if (value.schemaVersion !== RESUME_FACTS_SCHEMA_VERSION) add("SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion");
  validateDocument(value.document, add);
  validateIsoDate(value.createdAt, "$.createdAt", add);
  validateIsoDate(value.updatedAt, "$.updatedAt", add);

  if (!Array.isArray(value.facts)) add("FACTS_NOT_ARRAY", "$.facts");
  else {
    const ids = new Set();
    value.facts.forEach((fact, index) => {
      validateFact(fact, index, add);
      if (isRecord(fact) && typeof fact.id === "string") {
        if (ids.has(fact.id)) add("FACT_ID_DUPLICATE", `$.facts[${index}].id`);
        ids.add(fact.id);
      }
    });
  }

  if (!Array.isArray(value.privateFields)) add("PRIVATE_FIELDS_NOT_ARRAY", "$.privateFields");
  else value.privateFields.forEach((field, index) => validatePrivateField(field, index, add));
  if (!Array.isArray(value.timelineFlags)) add("TIMELINE_FLAGS_NOT_ARRAY", "$.timelineFlags");
  else value.timelineFlags.forEach((flag, index) => validateTimelineFlag(flag, index, add));
  validateReview(value.review, add);
  validateReferences(value, add);
  return { valid: errors.length === 0, errors };
}

/** @param {ResumeFacts} resumeFacts */
export function selectConfirmedFacts(resumeFacts) {
  return resumeFacts.facts.filter((fact) => fact.review.status === "confirmed");
}

/** @param {unknown} schemaVersion */
export function isResumeFactsSchemaSupported(schemaVersion) {
  return schemaVersion === RESUME_FACTS_SCHEMA_VERSION;
}

export class ResumeFactsModelError extends Error {
  /** @param {string} code */
  constructor(code) {
    super(code);
    this.name = "ResumeFactsModelError";
    this.code = code;
  }
}

/** @param {Record<string, unknown>} defaults @param {Record<string, unknown>} supplied */
function mergeFactData(defaults, supplied) {
  return Object.fromEntries(Object.entries({ ...defaults, ...supplied }).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateDocument(value, add) {
  if (!isRecord(value)) {
    add("DOCUMENT_INVALID", "$.document");
    return;
  }
  validateAllowedKeys(value, ["id", "format", "characterCount", "textLength"], "$.document", "DOCUMENT_KEY_UNKNOWN", add);
  if (!isNonEmptyString(value.id)) add("DOCUMENT_ID_INVALID", "$.document.id");
  if (!RESUME_SOURCE_FORMATS.includes(/** @type {ResumeSourceFormat} */ (value.format))) add("DOCUMENT_FORMAT_INVALID", "$.document.format");
  if (!Number.isInteger(value.characterCount) || Number(value.characterCount) < 0) add("DOCUMENT_CHARACTER_COUNT_INVALID", "$.document.characterCount");
  if (!Number.isInteger(value.textLength) || Number(value.textLength) < 0) add("DOCUMENT_TEXT_LENGTH_INVALID", "$.document.textLength");
  if (Number.isInteger(value.characterCount) && Number.isInteger(value.textLength) && Number(value.characterCount) > Number(value.textLength)) add("DOCUMENT_COUNTS_INCONSISTENT", "$.document.characterCount");
}

/** @param {unknown} value @param {number} index @param {(code: string, path: string) => void} add */
function validateFact(value, index, add) {
  const path = `$.facts[${index}]`;
  if (!isRecord(value)) {
    add("FACT_INVALID", path);
    return;
  }
  validateAllowedKeys(value, ["id", "category", "data", "sourceRefs", "confidence", "review", "provenance"], path, "FACT_KEY_UNKNOWN", add);
  if (!isNonEmptyString(value.id)) add("FACT_ID_INVALID", `${path}.id`);
  if (!RESUME_FACT_CATEGORIES.includes(/** @type {ResumeFactCategory} */ (value.category))) add("FACT_CATEGORY_INVALID", `${path}.category`);
  if (!FACT_PROVENANCE_TYPES.includes(/** @type {FactProvenance} */ (value.provenance))) add("FACT_PROVENANCE_INVALID", `${path}.provenance`);
  validateFactData(value.category, value.data, path, add);
  validateSourceRefs(value.sourceRefs, `${path}.sourceRefs`, add);
  if (value.provenance === "extracted" && Array.isArray(value.sourceRefs) && value.sourceRefs.length === 0) add("FACT_SOURCE_REQUIRED", `${path}.sourceRefs`);
  validateConfidence(value.confidence, `${path}.confidence`, add);
  validateFactReview(value.review, `${path}.review`, add);
}

/** @param {unknown} category @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function validateFactData(category, value, path, add) {
  if (!isRecord(value)) {
    add("FACT_DATA_INVALID", `${path}.data`);
    return;
  }
  const keys = REQUIRED_DATA_KEYS[String(category)] ?? [];
  validateAllowedKeys(value, keys, `${path}.data`, "FACT_DATA_KEY_UNKNOWN", add);
  keys.forEach((key) => {
    if (!(key in value)) add("FACT_DATA_KEY_MISSING", `${path}.data.${key}`);
  });
  const defaults = DATA_FACTORIES[/** @type {ResumeFactCategory} */ (category)]?.() ?? {};
  const normalizedDateFields = NORMALIZED_DATE_FIELDS[/** @type {"certification" | "achievement"} */ (category)] ?? [];
  Object.entries(defaults).forEach(([key, defaultValue]) => {
    if (!(key in value) || key === "dateRange" || normalizedDateFields.includes(key)) return;
    const supplied = value[key];
    if (Array.isArray(defaultValue)) {
      if (!Array.isArray(supplied) || supplied.some((item) => typeof item !== "string")) add("FACT_DATA_ARRAY_INVALID", `${path}.data.${key}`);
    } else if (supplied !== null && typeof supplied !== "string") add("FACT_DATA_VALUE_INVALID", `${path}.data.${key}`);
  });
  if ("dateRange" in value && value.dateRange !== null) validateDateRange(value.dateRange, `${path}.data.dateRange`, add);
  normalizedDateFields.forEach((key) => {
    if (value[key] !== null) validateNormalizedDate(value[key], `${path}.data.${key}`, add);
  });
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function validateSourceRefs(value, path, add) {
  if (!Array.isArray(value)) {
    add("SOURCE_REFS_NOT_ARRAY", path);
    return;
  }
  value.forEach((sourceRef, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(sourceRef)) {
      add("SOURCE_REF_INVALID", itemPath);
      return;
    }
    validateAllowedKeys(sourceRef, ["documentId", "startOffset", "endOffset", "page", "section"], itemPath, "SOURCE_REF_KEY_UNKNOWN", add);
    if (!isNonEmptyString(sourceRef.documentId)) add("SOURCE_DOCUMENT_ID_INVALID", `${itemPath}.documentId`);
    if (!Number.isInteger(sourceRef.startOffset) || Number(sourceRef.startOffset) < 0) add("SOURCE_START_INVALID", `${itemPath}.startOffset`);
    if (!Number.isInteger(sourceRef.endOffset) || Number(sourceRef.endOffset) <= Number(sourceRef.startOffset)) add("SOURCE_END_INVALID", `${itemPath}.endOffset`);
    if (sourceRef.page !== null && (!Number.isInteger(sourceRef.page) || Number(sourceRef.page) < 1)) add("SOURCE_PAGE_INVALID", `${itemPath}.page`);
    if (sourceRef.section !== null && typeof sourceRef.section !== "string") add("SOURCE_SECTION_INVALID", `${itemPath}.section`);
  });
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function validateConfidence(value, path, add) {
  if (!isRecord(value)) {
    add("CONFIDENCE_INVALID", path);
    return;
  }
  validateAllowedKeys(value, ["level", "score", "reasons"], path, "CONFIDENCE_KEY_UNKNOWN", add);
  if (!FACT_CONFIDENCE_LEVELS.includes(/** @type {FactConfidenceLevel} */ (value.level))) add("CONFIDENCE_LEVEL_INVALID", `${path}.level`);
  if (value.score !== null && (typeof value.score !== "number" || value.score < 0 || value.score > 1)) add("CONFIDENCE_SCORE_INVALID", `${path}.score`);
  if (!Array.isArray(value.reasons) || value.reasons.some((reason) => typeof reason !== "string")) add("CONFIDENCE_REASONS_INVALID", `${path}.reasons`);
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function validateFactReview(value, path, add) {
  if (!isRecord(value)) {
    add("FACT_REVIEW_INVALID", path);
    return;
  }
  validateAllowedKeys(value, ["status", "updatedAt"], path, "FACT_REVIEW_KEY_UNKNOWN", add);
  if (!FACT_REVIEW_STATUSES.includes(/** @type {FactReviewStatus} */ (value.status))) add("FACT_REVIEW_STATUS_INVALID", `${path}.status`);
  if (value.updatedAt !== null) validateIsoDate(value.updatedAt, `${path}.updatedAt`, add);
  if (value.status !== "pending" && value.updatedAt === null) add("FACT_REVIEW_TIMESTAMP_REQUIRED", `${path}.updatedAt`);
}

/** @param {unknown} value @param {number} index @param {(code: string, path: string) => void} add */
function validatePrivateField(value, index, add) {
  const path = `$.privateFields[${index}]`;
  if (!isRecord(value)) {
    add("PRIVATE_FIELD_INVALID", path);
    return;
  }
  validateAllowedKeys(value, ["id", "type", "maskedValue", "sourceRefs", "confidence", "reviewStatus"], path, "PRIVATE_FIELD_KEY_UNKNOWN", add);
  if (!isNonEmptyString(value.id)) add("PRIVATE_FIELD_ID_INVALID", `${path}.id`);
  if (!PRIVATE_FIELD_TYPES.includes(/** @type {typeof PRIVATE_FIELD_TYPES[number]} */ (value.type))) add("PRIVATE_FIELD_TYPE_INVALID", `${path}.type`);
  if (!isNonEmptyString(value.maskedValue)) add("PRIVATE_FIELD_MASK_INVALID", `${path}.maskedValue`);
  if (!FACT_CONFIDENCE_LEVELS.includes(/** @type {FactConfidenceLevel} */ (value.confidence))) add("PRIVATE_FIELD_CONFIDENCE_INVALID", `${path}.confidence`);
  if (!PRIVATE_FIELD_REVIEW_STATUSES.includes(/** @type {typeof PRIVATE_FIELD_REVIEW_STATUSES[number]} */ (value.reviewStatus))) add("PRIVATE_FIELD_REVIEW_INVALID", `${path}.reviewStatus`);
  validateSourceRefs(value.sourceRefs, `${path}.sourceRefs`, add);
  if (Array.isArray(value.sourceRefs) && value.sourceRefs.length === 0) add("PRIVATE_FIELD_SOURCE_REQUIRED", `${path}.sourceRefs`);
}

/** @param {unknown} value @param {number} index @param {(code: string, path: string) => void} add */
function validateTimelineFlag(value, index, add) {
  const path = `$.timelineFlags[${index}]`;
  if (!isRecord(value)) {
    add("TIMELINE_FLAG_INVALID", path);
    return;
  }
  validateAllowedKeys(value, ["id", "type", "factIds", "status", "messageKey"], path, "TIMELINE_FLAG_KEY_UNKNOWN", add);
  if (!isNonEmptyString(value.id)) add("TIMELINE_FLAG_ID_INVALID", `${path}.id`);
  if (!TIMELINE_FLAG_TYPES.includes(/** @type {typeof TIMELINE_FLAG_TYPES[number]} */ (value.type))) add("TIMELINE_FLAG_TYPE_INVALID", `${path}.type`);
  if (!Array.isArray(value.factIds) || value.factIds.length === 0 || value.factIds.some((factId) => !isNonEmptyString(factId))) add("TIMELINE_FLAG_FACT_IDS_INVALID", `${path}.factIds`);
  if (!TIMELINE_FLAG_STATUSES.includes(/** @type {typeof TIMELINE_FLAG_STATUSES[number]} */ (value.status))) add("TIMELINE_FLAG_STATUS_INVALID", `${path}.status`);
  if (!isNonEmptyString(value.messageKey)) add("TIMELINE_FLAG_MESSAGE_KEY_INVALID", `${path}.messageKey`);
}

/** @param {unknown} value @param {(code: string, path: string) => void} add */
function validateReview(value, add) {
  if (!isRecord(value)) {
    add("REVIEW_INVALID", "$.review");
    return;
  }
  validateAllowedKeys(value, ["status", "reviewedAt"], "$.review", "REVIEW_KEY_UNKNOWN", add);
  if (!RESUME_REVIEW_STATUSES.includes(/** @type {typeof RESUME_REVIEW_STATUSES[number]} */ (value.status))) add("REVIEW_STATUS_INVALID", "$.review.status");
  if (value.reviewedAt !== null) validateIsoDate(value.reviewedAt, "$.review.reviewedAt", add);
  if (value.status === "completed" && value.reviewedAt === null) add("REVIEWED_AT_REQUIRED", "$.review.reviewedAt");
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function validateDateRange(value, path, add) {
  if (!isRecord(value)) {
    add("DATE_RANGE_INVALID", path);
    return;
  }
  validateAllowedKeys(value, ["start", "end", "ongoing"], path, "DATE_RANGE_KEY_UNKNOWN", add);
  if (value.start !== null) validateNormalizedDate(value.start, `${path}.start`, add);
  if (value.end !== null) validateNormalizedDate(value.end, `${path}.end`, add);
  if (typeof value.ongoing !== "boolean") add("DATE_RANGE_ONGOING_INVALID", `${path}.ongoing`);
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function validateNormalizedDate(value, path, add) {
  if (!isRecord(value)) {
    add("NORMALIZED_DATE_INVALID", path);
    return;
  }
  validateAllowedKeys(value, ["value", "precision"], path, "NORMALIZED_DATE_KEY_UNKNOWN", add);
  const precision = String(value.precision);
  if (!["year", "month", "day", "unknown"].includes(precision)) {
    add("NORMALIZED_DATE_PRECISION_INVALID", `${path}.precision`);
    return;
  }
  const normalizedValue = value.value;
  const valid = precision === "unknown"
    ? normalizedValue === null
    : precision === "year"
      ? typeof normalizedValue === "string" && /^\d{4}$/u.test(normalizedValue)
      : precision === "month"
        ? typeof normalizedValue === "string" && /^\d{4}-(?:0[1-9]|1[0-2])$/u.test(normalizedValue)
        : typeof normalizedValue === "string" && isValidCalendarDay(normalizedValue);
  if (!valid) add("NORMALIZED_DATE_VALUE_INVALID", `${path}.value`);
}

/** @param {unknown} value @param {string} path @param {(code: string, path: string) => void} add */
function validateIsoDate(value, path, add) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) || Number.isNaN(Date.parse(value))) add("TIMESTAMP_INVALID", path);
}

/** @param {Record<string, unknown>} root @param {(code: string, path: string) => void} add */
function validateReferences(root, add) {
  const documentId = isRecord(root.document) && typeof root.document.id === "string" ? root.document.id : null;
  const textLength = isRecord(root.document) && Number.isInteger(root.document.textLength) ? Number(root.document.textLength) : null;
  const facts = Array.isArray(root.facts) ? root.facts : [];
  const factIds = new Set(facts.filter(isRecord).map((fact) => fact.id).filter(isNonEmptyString));
  const withSources = [
    ...facts.map((fact, index) => ({ value: fact, path: `$.facts[${index}]` })),
    ...(Array.isArray(root.privateFields) ? root.privateFields.map((field, index) => ({ value: field, path: `$.privateFields[${index}]` })) : []),
  ];
  withSources.forEach(({ value, path }) => {
    if (!isRecord(value) || !Array.isArray(value.sourceRefs)) return;
    value.sourceRefs.forEach((sourceRef, index) => {
      if (!isRecord(sourceRef)) return;
      if (documentId && sourceRef.documentId !== documentId) add("SOURCE_DOCUMENT_ID_MISMATCH", `${path}.sourceRefs[${index}].documentId`);
      if (textLength !== null && Number.isInteger(sourceRef.endOffset) && Number(sourceRef.endOffset) > textLength) add("SOURCE_OFFSET_OUT_OF_RANGE", `${path}.sourceRefs[${index}].endOffset`);
    });
  });
  facts.forEach((fact, index) => {
    if (!isRecord(fact) || fact.category !== "skill" || !isRecord(fact.data) || !Array.isArray(fact.data.evidenceFactIds)) return;
    fact.data.evidenceFactIds.forEach((factId, refIndex) => {
      if (!factIds.has(factId)) add("SKILL_EVIDENCE_FACT_UNKNOWN", `$.facts[${index}].data.evidenceFactIds[${refIndex}]`);
    });
  });
  if (!Array.isArray(root.timelineFlags)) return;
  root.timelineFlags.forEach((flag, index) => {
    if (!isRecord(flag) || !Array.isArray(flag.factIds)) return;
    flag.factIds.forEach((factId, refIndex) => {
      if (!factIds.has(factId)) add("TIMELINE_FACT_UNKNOWN", `$.timelineFlags[${index}].factIds[${refIndex}]`);
    });
  });
}

/** @param {string} value */
function isValidCalendarDay(value) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** @param {Record<string, unknown>} value @param {string[]} allowed @param {string} path @param {string} code @param {(code: string, path: string) => void} add */
function validateAllowedKeys(value, allowed, path, code, add) {
  Object.keys(value).forEach((key) => {
    if (!allowed.includes(key)) add(code, `${path}.${key}`);
  });
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** @param {unknown} value @returns {value is string} */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
