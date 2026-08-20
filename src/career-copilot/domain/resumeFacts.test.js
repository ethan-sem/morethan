import { describe, expect, it } from "vitest";
import {
  createEmptyResumeFacts,
  createResumeFact,
  isResumeFactsSchemaSupported,
  RESUME_FACT_CATEGORIES,
  RESUME_FACTS_SCHEMA_VERSION,
  ResumeFactsModelError,
  selectConfirmedFacts,
  validateResumeFacts,
} from "./resumeFacts.js";

const NOW = "2026-08-09T12:00:00.000Z";

function emptyDocument() {
  return createEmptyResumeFacts({
    documentId: "doc-001",
    format: "pdf",
    characterCount: 80,
    textLength: 120,
    now: NOW,
  });
}

function sourceRef(overrides = {}) {
  return {
    documentId: "doc-001",
    startOffset: 10,
    endOffset: 40,
    page: 1,
    section: "教育经历",
    ...overrides,
  };
}

describe("ResumeFacts v1 factories", () => {
  it("creates a deterministic empty document without raw resume text", () => {
    const first = emptyDocument();
    const second = emptyDocument();

    expect(first).toMatchObject({
      schemaVersion: "1.0.0",
      document: { id: "doc-001", format: "pdf", characterCount: 80, textLength: 120 },
      review: { status: "not_started", reviewedAt: null },
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(first).not.toHaveProperty("rawText");
    expect(first.facts).not.toBe(second.facts);
    expect(first.privateFields).not.toBe(second.privateFields);
  });

  it.each(RESUME_FACT_CATEGORIES)("creates canonical, independent %s payloads", (category) => {
    const first = createResumeFact({ id: `${category}-1`, category, provenance: "user_added" });
    const second = createResumeFact({ id: `${category}-2`, category, provenance: "user_added" });
    expect(first.category).toBe(category);
    expect(first.review).toEqual({ status: "pending", updatedAt: null });
    expect(first.confidence).toEqual({ level: "low", score: null, reasons: [] });
    expect(first.data).not.toBe(second.data);
  });

  it("rejects unsupported categories before creating ambiguous data", () => {
    expect(() => createResumeFact({ id: "bad", category: "employment" })).toThrowError(
      expect.objectContaining({ name: "ResumeFactsModelError", code: "FACT_CATEGORY_UNSUPPORTED" }),
    );
    expect(new ResumeFactsModelError("TEST").message).toBe("TEST");
  });
});

describe("ResumeFacts v1 validation", () => {
  it("accepts a complete evidence-linked document", () => {
    const resumeFacts = emptyDocument();
    resumeFacts.facts.push(
      createResumeFact({
        id: "fact-education-1",
        category: "education",
        data: {
          institution: "MoreThan 大学",
          degree: "本科",
          major: "信息管理",
          dateRange: {
            start: { value: "2023-09", precision: "month" },
            end: { value: "2027-06", precision: "month" },
            ongoing: true,
          },
          highlights: ["校级奖学金"],
        },
        sourceRefs: [sourceRef()],
        confidence: { level: "high", score: 0.95, reasons: ["section_heading"] },
      }),
      createResumeFact({
        id: "fact-skill-1",
        category: "skill",
        data: { name: "数据分析", level: null, keywords: ["SQL"], evidenceFactIds: ["fact-education-1"] },
        sourceRefs: [sourceRef({ startOffset: 45, endOffset: 60, section: "技能" })],
      }),
    );
    resumeFacts.privateFields.push({
      id: "private-email-1",
      type: "email",
      maskedValue: "m***@example.com",
      sourceRefs: [sourceRef({ startOffset: 0, endOffset: 8, section: null })],
      confidence: "high",
      reviewStatus: "detected",
    });
    resumeFacts.timelineFlags.push({
      id: "timeline-1",
      type: "date_overlap",
      factIds: ["fact-education-1"],
      status: "open",
      messageKey: "timeline.date_overlap.review_only",
    });

    expect(validateResumeFacts(resumeFacts)).toEqual({ valid: true, errors: [] });
  });

  it("enforces the exact schema version and rejects undeclared raw data", () => {
    const resumeFacts = { ...emptyDocument(), schemaVersion: "2.0.0", rawText: "private resume" };
    const result = validateResumeFacts(resumeFacts);

    expect(isResumeFactsSchemaSupported(RESUME_FACTS_SCHEMA_VERSION)).toBe(true);
    expect(isResumeFactsSchemaSupported("2.0.0")).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      { code: "SCHEMA_VERSION_UNSUPPORTED", path: "$.schemaVersion" },
      { code: "ROOT_KEY_UNKNOWN", path: "$.rawText" },
    ]));
  });

  it("requires extracted facts to point to the same source document", () => {
    const resumeFacts = emptyDocument();
    resumeFacts.facts.push(createResumeFact({ id: "fact-1", category: "project", sourceRefs: [] }));
    resumeFacts.facts.push(createResumeFact({
      id: "fact-2",
      category: "project",
      sourceRefs: [sourceRef({ documentId: "other-doc", endOffset: 130 })],
    }));
    const codes = validateResumeFacts(resumeFacts).errors.map(({ code }) => code);

    expect(codes).toContain("FACT_SOURCE_REQUIRED");
    expect(codes).toContain("SOURCE_DOCUMENT_ID_MISMATCH");
    expect(codes).toContain("SOURCE_OFFSET_OUT_OF_RANGE");
  });

  it("rejects duplicate and dangling fact references", () => {
    const resumeFacts = emptyDocument();
    resumeFacts.facts.push(
      createResumeFact({ id: "fact-1", category: "education", sourceRefs: [sourceRef()] }),
      createResumeFact({
        id: "fact-1",
        category: "skill",
        data: { evidenceFactIds: ["missing-fact"] },
        sourceRefs: [sourceRef()],
      }),
    );
    resumeFacts.timelineFlags.push({ id: "flag-1", type: "date_conflict", factIds: ["missing-fact"], status: "open", messageKey: "timeline.conflict" });
    const codes = validateResumeFacts(resumeFacts).errors.map(({ code }) => code);

    expect(codes).toContain("FACT_ID_DUPLICATE");
    expect(codes).toContain("SKILL_EVIDENCE_FACT_UNKNOWN");
    expect(codes).toContain("TIMELINE_FACT_UNKNOWN");
  });

  it("validates date precision, real calendar days and review timestamps", () => {
    const resumeFacts = emptyDocument();
    resumeFacts.facts.push(createResumeFact({
      id: "fact-project-1",
      category: "project",
      provenance: "user_added",
      data: {
        dateRange: {
          start: { value: "2026-02-31", precision: "day" },
          end: { value: "2027", precision: "month" },
          ongoing: false,
        },
      },
      review: { status: "confirmed", updatedAt: null },
    }));
    resumeFacts.review = { status: "completed", reviewedAt: null };
    const codes = validateResumeFacts(resumeFacts).errors.map(({ code }) => code);

    expect(codes.filter((code) => code === "NORMALIZED_DATE_VALUE_INVALID")).toHaveLength(2);
    expect(codes).toContain("FACT_REVIEW_TIMESTAMP_REQUIRED");
    expect(codes).toContain("REVIEWED_AT_REQUIRED");
  });

  it("uses the same normalized date contract for certificates and achievements", () => {
    const resumeFacts = emptyDocument();
    resumeFacts.facts.push(createResumeFact({
      id: "cert-1",
      category: "certification",
      provenance: "user_added",
      data: { issuedAt: { value: "2026-08", precision: "month" }, expiresAt: { value: null, precision: "unknown" } },
    }));
    expect(validateResumeFacts(resumeFacts)).toEqual({ valid: true, errors: [] });

    resumeFacts.facts[0].data.issuedAt = { value: "2026-13", precision: "month" };
    expect(validateResumeFacts(resumeFacts).errors).toContainEqual({
      code: "NORMALIZED_DATE_VALUE_INVALID",
      path: "$.facts[0].data.issuedAt.value",
    });
  });

  it("forbids raw private-field values through the closed v1 schema", () => {
    const resumeFacts = emptyDocument();
    resumeFacts.privateFields.push({
      id: "private-phone-1",
      type: "phone",
      maskedValue: "138****0000",
      rawValue: "13800000000",
      sourceRefs: [sourceRef()],
      confidence: "high",
      reviewStatus: "detected",
    });

    expect(validateResumeFacts(resumeFacts).errors).toContainEqual({
      code: "PRIVATE_FIELD_KEY_UNKNOWN",
      path: "$.privateFields[0].rawValue",
    });
  });

  it("only selects user-confirmed facts for downstream analysis", () => {
    const resumeFacts = emptyDocument();
    const confirmed = createResumeFact({ id: "confirmed", category: "skill", provenance: "user_added", review: { status: "confirmed", updatedAt: NOW } });
    const pending = createResumeFact({ id: "pending", category: "skill", provenance: "user_added" });
    const excluded = createResumeFact({ id: "excluded", category: "skill", provenance: "user_added", review: { status: "excluded", updatedAt: NOW } });
    const uncertain = createResumeFact({ id: "uncertain", category: "skill", provenance: "user_added", review: { status: "uncertain", updatedAt: NOW } });
    resumeFacts.facts.push(confirmed, pending, excluded, uncertain);

    expect(selectConfirmedFacts(resumeFacts)).toEqual([confirmed]);
  });
});
