import { describe, expect, it } from "vitest";
import { createResumeFact } from "./resumeFacts.js";
import { FACT_REVIEW_GUIDANCE_VERSION, getFactReviewGuidance } from "./factReviewGuidance.js";

describe("fact review guidance", () => {
  it("marks low-confidence inferred facts and explains missing evidence", () => {
    const fact = createResumeFact({ id: "fact-1", category: "internship", data: { organization: "MoreThan 科技" }, confidence: { level: "low", score: 0.45, reasons: ["section_inferred"] }, sourceRefs: [{ documentId: "doc", startOffset: 0, endOffset: 10, page: null, section: null }] });
    expect(FACT_REVIEW_GUIDANCE_VERSION).toBe("1.0.0");
    expect(getFactReviewGuidance(fact)).toMatchObject({ needsAttention: true, title: expect.stringContaining("低置信"), missing: ["岗位", "时间", "个人动作或结果"], reasons: ["未发现明确章节标题"] });
  });

  it("does not invent missing evidence for a complete fact", () => {
    const fact = createResumeFact({ id: "fact-1", category: "project", data: { name: "增长项目", role: "负责人", actions: ["完成调研"] }, confidence: { level: "high", score: 0.9, reasons: ["section_heading", "primary_field_detected"] }, sourceRefs: [{ documentId: "doc", startOffset: 0, endOffset: 10, page: null, section: "项目经历" }] });
    expect(getFactReviewGuidance(fact)).toMatchObject({ needsAttention: false, title: "识别依据较完整", missing: [] });
  });

  it("treats medium-confidence incomplete facts as needing review", () => {
    const fact = createResumeFact({ id: "fact-1", category: "education", data: { institution: "MoreThan 大学" }, confidence: { level: "medium", score: 0.7, reasons: ["section_heading"] }, sourceRefs: [{ documentId: "doc", startOffset: 0, endOffset: 10, page: null, section: "教育经历" }] });
    expect(getFactReviewGuidance(fact)).toMatchObject({ needsAttention: true, title: expect.stringContaining("信息不完整"), missing: ["学历", "时间"] });
  });
});
