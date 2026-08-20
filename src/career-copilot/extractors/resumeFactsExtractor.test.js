import { describe, expect, it } from "vitest";
import { validateResumeFacts } from "../domain/resumeFacts.js";
import { detectPrivateFields } from "../privacy/piiDetector.js";
import { extractResumeFacts, RESUME_FACTS_EXTRACTOR_VERSION } from "./resumeFactsExtractor.js";

const NOW = "2026-08-10T00:00:00.000Z";

function extract(text, overrides = {}) {
  return extractResumeFacts({
    text,
    documentId: "resume-document-1",
    format: "paste",
    characterCount: text.replace(/\s/gu, "").length,
    now: NOW,
    ...overrides,
  });
}

describe("ResumeFacts local rule extractor", () => {
  it("extracts all seven fact categories with evidence and pending review", () => {
    const text = [
      "教育经历",
      "MoreThan 大学 | 信息管理专业 | 本科 | 2023.09-2027.06",
      "GPA 3.8/4.0，校级奖学金",
      "",
      "实习经历",
      "MoreThan 科技公司 | 产品运营实习生 | 上海 | 2024.06-2024.09",
      "通过 SQL 分析用户数据，推动转化率提升 20%",
      "",
      "项目经历",
      "用户反馈看板 | 项目负责人 | 2024.03-2024.05",
      "使用 Python 和 Tableau 搭建看板，覆盖 4 个业务场景",
      "",
      "校园经历",
      "学生会 | 宣传部部长 | 2023.09-2024.06",
      "负责组织 6 场活动，覆盖 500 人",
      "",
      "技能",
      "Python、SQL、Excel、用户研究",
      "",
      "证书",
      "CET-6 英语证书 | 2024.06",
      "",
      "荣誉奖项",
      "校级一等奖学金 | 2024.10",
    ].join("\n");
    const result = extract(text);

    expect(RESUME_FACTS_EXTRACTOR_VERSION).toBe("1.0.0");
    expect(new Set(result.facts.map((fact) => fact.category))).toEqual(new Set(["education", "internship", "project", "campus", "skill", "certification", "achievement"]));
    expect(result.facts.every((fact) => fact.review.status === "pending" && fact.sourceRefs.length === 1)).toBe(true);
    expect(result.facts.find((fact) => fact.category === "internship")?.data).toMatchObject({ organization: "MoreThan 科技公司", role: "产品运营实习生", location: "上海", metrics: ["20%"] });
    expect(result.facts.find((fact) => fact.category === "project")?.data.technologies).toEqual(["Python", "Tableau"]);
    expect(result.facts.filter((fact) => fact.category === "skill").map((fact) => fact.data.name)).toEqual(["Python", "SQL", "Excel", "用户研究"]);
    expect(validateResumeFacts(result)).toEqual({ valid: true, errors: [] });
  });

  it("keeps sensitive raw values out of structured facts", () => {
    const text = "姓名：张三\n邮箱：zhang.san@example.com\n\n教育经历\nMoreThan 大学 | 本科 | 2023-2027\n项目联系邮箱 zhang.san@example.com";
    const privateFields = detectPrivateFields(text, { documentId: "resume-document-1" });
    const result = extract(text, { privateFields });
    expect(JSON.stringify(result.facts)).not.toContain("zhang.san@example.com");
    expect(result.privateFields).toEqual(privateFields);
    expect(result).not.toHaveProperty("rawText");
  });

  it("maps evidence back to a PDF page when page text is available", () => {
    const firstPage = "教育经历\nMoreThan 大学 | 本科 | 2023-2027";
    const secondPage = "项目经历\n增长项目 | 2024.03-2024.05\n负责分析";
    const text = `${firstPage}\n\n${secondPage}`;
    const result = extract(text, { format: "pdf", pages: [{ pageNumber: 1, text: firstPage }, { pageNumber: 2, text: secondPage }] });
    expect(result.facts.find((fact) => fact.category === "education")?.sourceRefs[0].page).toBe(1);
    expect(result.facts.find((fact) => fact.category === "project")?.sourceRefs[0].page).toBe(2);
  });

  it("creates review-only timeline flags for invalid, missing, conflicting and overlapping dates", () => {
    const text = [
      "实习经历",
      "甲公司 | 产品实习生 | 2024.06-2024.09",
      "负责调研",
      "乙公司 | 运营实习生 | 2024.08-2024.12",
      "负责复盘",
      "丙公司 | 分析实习生 | 2025.05-2025.02",
      "负责分析",
      "丁公司 | 助理",
      "负责整理资料",
      "",
      "项目经历",
      "异常日期项目 | 2024.13-2024.14",
      "负责测试",
    ].join("\n");
    const result = extract(text);
    const types = result.timelineFlags.map((flag) => flag.type);
    expect(types).toContain("date_overlap");
    expect(types).toContain("date_conflict");
    expect(types).toContain("date_missing");
    expect(types).toContain("date_invalid");
    expect(result.timelineFlags.every((flag) => flag.status === "open" && flag.messageKey.startsWith("resume.timeline."))).toBe(true);
    expect(validateResumeFacts(result)).toEqual({ valid: true, errors: [] });
  });

  it("assigns lower confidence to unheaded inferred facts", () => {
    const text = "MoreThan 大学 | 信息管理本科 | 2023-2027\nGPA 3.8/4.0";
    const result = extract(text);
    expect(result.facts[0]).toMatchObject({ category: "education", confidence: { level: "medium", reasons: expect.arrayContaining(["section_inferred"]) } });
  });

  it("is deterministic and rejects invalid input contracts", () => {
    const text = "技能\nSQL、Excel";
    expect(extract(text)).toEqual(extract(text));
    expect(() => extractResumeFacts({ text, documentId: "", format: "paste" })).toThrow("FACTS_DOCUMENT_ID_INVALID");
    expect(() => extractResumeFacts({ text, documentId: "doc", format: "html" })).toThrow("FACTS_FORMAT_INVALID");
  });
});
