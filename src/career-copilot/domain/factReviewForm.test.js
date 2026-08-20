import { describe, expect, it } from "vitest";
import { createResumeFact } from "./resumeFacts.js";
import { createBlankFactDraft, factToFormValues, FactReviewFormError, formValuesToFactData, formatFactSummary, getMaskedFactSourceExcerpt } from "./factReviewForm.js";

describe("fact review form mapping", () => {
  it("round-trips structured experience fields and normalized dates", () => {
    const fact = createResumeFact({ id: "fact-1", category: "internship", data: { organization: "甲公司", role: "产品实习生", dateRange: { start: { value: "2024-06", precision: "month" }, end: null, ongoing: true }, actions: ["负责调研"] }, provenance: "user_added" });
    const values = factToFormValues(fact);
    expect(values).toMatchObject({ organization: "甲公司", startDate: "2024-06", ongoing: true, actions: "负责调研" });
    const data = formValuesToFactData(fact, { ...values, organization: "乙公司", ongoing: false, endDate: "2024-09", actions: "完成访谈\n输出报告" });
    expect(data).toMatchObject({ organization: "乙公司", dateRange: { start: { value: "2024-06", precision: "month" }, end: { value: "2024-09", precision: "month" }, ongoing: false }, actions: ["完成访谈", "输出报告"] });
  });

  it("creates complete blank category drafts", () => {
    expect(createBlankFactDraft("project").data).toMatchObject({ name: null, actions: [], technologies: [] });
  });

  it("rejects invalid user dates with a field reference", () => {
    const fact = createBlankFactDraft("education");
    expect(() => formValuesToFactData(fact, { startDate: "2024-13" })).toThrow(expect.objectContaining({ name: "FactReviewFormError", field: "startDate" }));
    expect(new FactReviewFormError("DATE_INVALID", "startDate").code).toBe("DATE_INVALID");
  });

  it("formats concise summaries", () => {
    const fact = createResumeFact({ id: "fact-1", category: "education", data: { institution: "MoreThan 大学", degree: "本科", major: "信息管理", dateRange: { start: { value: "2023", precision: "year" }, end: { value: "2027", precision: "year" }, ongoing: false } }, provenance: "user_added" });
    expect(formatFactSummary(fact)).toBe("MoreThan 大学 · 本科 · 信息管理 · 2023—2027");
  });

  it("shows masked source excerpts and safe copy for user-added facts", () => {
    const text = "项目经历\n联系邮箱 zhang@example.com\n负责调研";
    const start = text.indexOf("联系邮箱");
    const end = text.length;
    const emailStart = text.indexOf("zhang@example.com");
    const fact = createResumeFact({ id: "fact-1", category: "project", data: { name: "调研项目" }, sourceRefs: [{ documentId: "doc", startOffset: start, endOffset: end, page: null, section: "项目经历" }] });
    const fields = [{ id: "private-email", type: "email", maskedValue: "z***@example.com", sourceRefs: [{ documentId: "doc", startOffset: emailStart, endOffset: emailStart + "zhang@example.com".length, page: null, section: null }], confidence: "high", reviewStatus: "detected" }];
    expect(getMaskedFactSourceExcerpt(text, fact, fields)).toContain("z***@example.com");
    expect(getMaskedFactSourceExcerpt(text, fact, fields)).not.toContain("zhang@example.com");
    expect(getMaskedFactSourceExcerpt(text, createBlankFactDraft("skill"), [])).toBe("用户手动新增，无原文来源。");
  });
});
