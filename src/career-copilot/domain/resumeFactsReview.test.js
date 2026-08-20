import { describe, expect, it } from "vitest";
import { createEmptyResumeFacts, createResumeFact, selectConfirmedFacts, validateResumeFacts } from "./resumeFacts.js";
import { addResumeFact, completeResumeFactsReview, deleteResumeFact, getResumeFactsReviewProgress, ResumeFactsReviewError, setFactReviewStatus, setTimelineFlagStatus, updateResumeFactData } from "./resumeFactsReview.js";

const NOW = "2026-08-10T01:00:00.000Z";

function documentWithFacts() {
  const result = createEmptyResumeFacts({ documentId: "doc", format: "paste", characterCount: 20, textLength: 30, now: NOW });
  result.facts.push(
    createResumeFact({ id: "fact-education-001", category: "education", data: { institution: "MoreThan 大学" }, sourceRefs: [{ documentId: "doc", startOffset: 0, endOffset: 10, page: null, section: "教育经历" }] }),
    createResumeFact({ id: "fact-project-001", category: "project", data: { name: "增长项目" }, sourceRefs: [{ documentId: "doc", startOffset: 11, endOffset: 20, page: null, section: "项目经历" }] }),
  );
  return result;
}

describe("ResumeFacts review operations", () => {
  it("confirms or excludes facts immutably and exposes only confirmed analysis input", () => {
    const source = documentWithFacts();
    const confirmed = setFactReviewStatus(source, "fact-education-001", "confirmed", NOW);
    const reviewed = setFactReviewStatus(confirmed, "fact-project-001", "excluded", NOW);
    expect(source.facts[0].review.status).toBe("pending");
    expect(reviewed.review).toEqual({ status: "in_progress", reviewedAt: null });
    expect(selectConfirmedFacts(reviewed).map((fact) => fact.id)).toEqual(["fact-education-001"]);
    expect(getResumeFactsReviewProgress(reviewed)).toEqual({ total: 2, pending: 0, confirmed: 1, excluded: 1, uncertain: 0 });
  });

  it("marks edited facts as user-edited and pending", () => {
    const confirmed = setFactReviewStatus(documentWithFacts(), "fact-education-001", "confirmed", NOW);
    const edited = updateResumeFactData(confirmed, "fact-education-001", { ...confirmed.facts[0].data, institution: "MoreThan 商学院" }, NOW);
    expect(edited.facts[0]).toMatchObject({ provenance: "user_edited", data: { institution: "MoreThan 商学院" }, review: { status: "pending", updatedAt: null } });
    expect(validateResumeFacts(edited).valid).toBe(true);
  });

  it("adds stable user facts with no invented source", () => {
    const first = addResumeFact(documentWithFacts(), { category: "skill", data: { name: "SQL" } }, NOW);
    const second = addResumeFact(first, { category: "skill", data: { name: "Excel" } }, NOW);
    expect(second.facts.slice(-2).map((fact) => fact.id)).toEqual(["fact-user-skill-001", "fact-user-skill-002"]);
    expect(second.facts.at(-1)).toMatchObject({ provenance: "user_added", sourceRefs: [], review: { status: "pending" }, confidence: { reasons: ["user_added"] } });
  });

  it("deletes dependent timeline and skill references safely", () => {
    const source = documentWithFacts();
    source.facts.push(createResumeFact({ id: "fact-skill-001", category: "skill", data: { name: "分析", evidenceFactIds: ["fact-project-001"] }, sourceRefs: [{ documentId: "doc", startOffset: 20, endOffset: 25, page: null, section: "技能" }] }));
    source.timelineFlags.push({ id: "timeline-1", type: "date_missing", factIds: ["fact-project-001"], status: "open", messageKey: "resume.timeline.date_missing" });
    const next = deleteResumeFact(source, "fact-project-001", NOW);
    expect(next.facts.some((fact) => fact.id === "fact-project-001")).toBe(false);
    expect(next.facts.find((fact) => fact.category === "skill")?.data.evidenceFactIds).toEqual([]);
    expect(next.timelineFlags).toEqual([]);
    expect(validateResumeFacts(next).valid).toBe(true);
  });

  it("blocks completion until pending facts are resolved and one fact remains confirmed", () => {
    expect(() => completeResumeFactsReview(documentWithFacts(), NOW)).toThrow(expect.objectContaining({ code: "REVIEW_PENDING_FACTS" }));
    let reviewed = setFactReviewStatus(documentWithFacts(), "fact-education-001", "excluded", NOW);
    reviewed = setFactReviewStatus(reviewed, "fact-project-001", "excluded", NOW);
    expect(() => completeResumeFactsReview(reviewed, NOW)).toThrow(expect.objectContaining({ code: "REVIEW_NO_CONFIRMED_FACTS" }));
    reviewed = setFactReviewStatus(reviewed, "fact-education-001", "confirmed", NOW);
    expect(completeResumeFactsReview(reviewed, NOW).review).toEqual({ status: "completed", reviewedAt: NOW });
  });

  it("records timeline review decisions without changing fact truth status", () => {
    const source = documentWithFacts();
    source.timelineFlags.push({ id: "timeline-1", type: "date_overlap", factIds: ["fact-education-001", "fact-project-001"], status: "open", messageKey: "resume.timeline.date_overlap" });
    const confirmed = setTimelineFlagStatus(source, "timeline-1", "confirmed", NOW);
    expect(confirmed.timelineFlags[0].status).toBe("confirmed");
    expect(confirmed.facts.every((fact) => fact.review.status === "pending")).toBe(true);
    expect(setTimelineFlagStatus(confirmed, "timeline-1", "dismissed", NOW).timelineFlags[0].status).toBe("dismissed");
  });

  it("fails with stable errors for missing facts or invalid edits", () => {
    expect(() => setFactReviewStatus(documentWithFacts(), "missing", "confirmed", NOW)).toThrow(ResumeFactsReviewError);
    expect(() => updateResumeFactData(documentWithFacts(), "fact-education-001", { unexpected: "raw" }, NOW)).toThrow(expect.objectContaining({ code: "FACT_DATA_KEY_UNKNOWN" }));
    expect(() => addResumeFact(documentWithFacts(), { category: "skill" }, NOW)).toThrow(expect.objectContaining({ code: "FACT_PRIMARY_REQUIRED" }));
  });
});
