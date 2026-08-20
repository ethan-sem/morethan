import { createResumeFact, validateResumeFacts } from "./resumeFacts.js";

/** @typedef {ReturnType<import("./resumeFacts.js").createEmptyResumeFacts>} ResumeFacts */
/** @typedef {ResumeFacts["facts"][number]} ResumeFact */
/** @typedef {"pending" | "confirmed" | "excluded" | "uncertain"} ReviewStatus */

export class ResumeFactsReviewError extends Error {
  /** @param {string} code */
  constructor(code) {
    super(code);
    this.name = "ResumeFactsReviewError";
    this.code = code;
  }
}

/** @param {ResumeFacts} resumeFacts @param {string} factId @param {ReviewStatus} status @param {string} [now] */
export function setFactReviewStatus(resumeFacts, factId, status, now = new Date().toISOString()) {
  if (!new Set(["pending", "confirmed", "excluded", "uncertain"]).has(status)) throw new ResumeFactsReviewError("FACT_REVIEW_STATUS_INVALID");
  const next = cloneAndAssert(resumeFacts);
  const fact = findFact(next, factId);
  fact.review = { status, updatedAt: status === "pending" ? null : now };
  reopenReview(next, now);
  return assertResult(next);
}

/** @param {ResumeFacts} resumeFacts @param {string} factId @param {Record<string, unknown>} data @param {string} [now] */
export function updateResumeFactData(resumeFacts, factId, data, now = new Date().toISOString()) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ResumeFactsReviewError("FACT_DATA_INVALID");
  const next = cloneAndAssert(resumeFacts);
  const index = next.facts.findIndex((fact) => fact.id === factId);
  if (index < 0) throw new ResumeFactsReviewError("FACT_NOT_FOUND");
  const current = next.facts[index];
  const updated = createResumeFact({
    id: current.id,
    category: current.category,
    data,
    sourceRefs: current.sourceRefs,
    confidence: current.confidence,
    review: { status: "pending", updatedAt: null },
    provenance: "user_edited",
  });
  next.facts[index] = updated;
  const structure = validateResumeFacts(next);
  if (!structure.valid) throw new ResumeFactsReviewError(structure.errors[0]?.code ?? "RESUME_FACTS_INVALID");
  if (!hasPrimaryValue(updated)) throw new ResumeFactsReviewError("FACT_PRIMARY_REQUIRED");
  reopenReview(next, now);
  return assertResult(next);
}

/** @param {ResumeFacts} resumeFacts @param {{ category: ResumeFact["category"], data?: Record<string, unknown> }} input @param {string} [now] */
export function addResumeFact(resumeFacts, input, now = new Date().toISOString()) {
  const next = cloneAndAssert(resumeFacts);
  const id = nextUserFactId(next, input.category);
  const added = createResumeFact({
    id,
    category: input.category,
    data: input.data,
    sourceRefs: [],
    confidence: { level: "high", score: 1, reasons: ["user_added"] },
    review: { status: "pending", updatedAt: null },
    provenance: "user_added",
  });
  if (!hasPrimaryValue(added)) throw new ResumeFactsReviewError("FACT_PRIMARY_REQUIRED");
  next.facts.push(added);
  reopenReview(next, now);
  return assertResult(next);
}

/** @param {ResumeFacts} resumeFacts @param {string} factId @param {string} [now] */
export function deleteResumeFact(resumeFacts, factId, now = new Date().toISOString()) {
  const next = cloneAndAssert(resumeFacts);
  if (!next.facts.some((fact) => fact.id === factId)) throw new ResumeFactsReviewError("FACT_NOT_FOUND");
  next.facts = next.facts.filter((fact) => fact.id !== factId).map(removeEvidenceReference(factId));
  next.timelineFlags = next.timelineFlags
    .map((flag) => ({ ...flag, factIds: flag.factIds.filter((id) => id !== factId) }))
    .filter((flag) => flag.factIds.length > 0);
  reopenReview(next, now);
  return assertResult(next);
}

/** @param {ResumeFacts} resumeFacts @param {string} [now] */
export function completeResumeFactsReview(resumeFacts, now = new Date().toISOString()) {
  const next = cloneAndAssert(resumeFacts);
  const progress = getResumeFactsReviewProgress(next);
  if (progress.pending > 0) throw new ResumeFactsReviewError("REVIEW_PENDING_FACTS");
  if (progress.confirmed === 0) throw new ResumeFactsReviewError("REVIEW_NO_CONFIRMED_FACTS");
  next.review = { status: "completed", reviewedAt: now };
  next.updatedAt = now;
  return assertResult(next);
}

/** @param {ResumeFacts} resumeFacts */
export function getResumeFactsReviewProgress(resumeFacts) {
  const counts = { total: resumeFacts.facts.length, pending: 0, confirmed: 0, excluded: 0, uncertain: 0 };
  resumeFacts.facts.forEach((fact) => { counts[fact.review.status] += 1; });
  return counts;
}

/** @param {ResumeFacts} resumeFacts @param {string} flagId @param {"confirmed" | "dismissed"} status @param {string} [now] */
export function setTimelineFlagStatus(resumeFacts, flagId, status, now = new Date().toISOString()) {
  if (!new Set(["confirmed", "dismissed"]).has(status)) throw new ResumeFactsReviewError("TIMELINE_REVIEW_STATUS_INVALID");
  const next = cloneAndAssert(resumeFacts);
  const flag = next.timelineFlags.find((candidate) => candidate.id === flagId);
  if (!flag) throw new ResumeFactsReviewError("TIMELINE_FLAG_NOT_FOUND");
  flag.status = status;
  reopenReview(next, now);
  return assertResult(next);
}

/** @param {ResumeFacts} resumeFacts */
function cloneAndAssert(resumeFacts) {
  const validation = validateResumeFacts(resumeFacts);
  if (!validation.valid) throw new ResumeFactsReviewError("RESUME_FACTS_INVALID");
  return structuredClone(resumeFacts);
}

/** @param {ResumeFacts} resumeFacts @param {string} factId */
function findFact(resumeFacts, factId) {
  const fact = resumeFacts.facts.find((candidate) => candidate.id === factId);
  if (!fact) throw new ResumeFactsReviewError("FACT_NOT_FOUND");
  return fact;
}

/** @param {ResumeFacts} resumeFacts @param {string} now */
function reopenReview(resumeFacts, now) {
  resumeFacts.review = { status: "in_progress", reviewedAt: null };
  resumeFacts.updatedAt = now;
}

/** @param {ResumeFacts} resumeFacts */
function assertResult(resumeFacts) {
  const validation = validateResumeFacts(resumeFacts);
  if (!validation.valid) throw new ResumeFactsReviewError(validation.errors[0]?.code ?? "RESUME_FACTS_INVALID");
  return resumeFacts;
}

/** @param {ResumeFacts} resumeFacts @param {ResumeFact["category"]} category */
function nextUserFactId(resumeFacts, category) {
  const prefix = `fact-user-${category}-`;
  const max = resumeFacts.facts.reduce((current, fact) => {
    if (!fact.id.startsWith(prefix)) return current;
    const suffix = Number(fact.id.slice(prefix.length));
    return Number.isInteger(suffix) ? Math.max(current, suffix) : current;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** @param {string} factId */
function removeEvidenceReference(factId) {
  /** @param {ResumeFact} fact */
  return (fact) => {
    if (fact.category !== "skill" || !Array.isArray(fact.data.evidenceFactIds)) return fact;
    return { ...fact, data: { ...fact.data, evidenceFactIds: fact.data.evidenceFactIds.filter((id) => id !== factId) } };
  };
}

/** @param {ResumeFact} fact */
function hasPrimaryValue(fact) {
  const primaryKeys = { education: ["institution"], internship: ["organization", "role"], project: ["name"], campus: ["organization", "role"], skill: ["name"], certification: ["name"], achievement: ["title"] };
  return primaryKeys[fact.category].some((key) => typeof fact.data[key] === "string" && fact.data[key].trim());
}
