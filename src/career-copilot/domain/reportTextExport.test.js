import { describe, expect, it } from "vitest";
import { createActionPlan } from "./actionPlan.js";
import { createApplicationTierPlan } from "./applicationTierPlan.js";
import { analyzeCareerProfile } from "./careerProfileAnalysis.js";
import { createEvidenceDegradationPlan } from "./evidenceDegradation.js";
import { buildPrivacySafeReportText, ReportTextExportError } from "./reportTextExport.js";
import { createEmptyResumeFacts, createResumeFact } from "./resumeFacts.js";

const NOW = "2026-08-14T02:00:00.000Z";

function createInput() {
  const resume = createEmptyResumeFacts({ documentId: "doc-export", format: "paste", characterCount: 300, textLength: 300, now: NOW });
  resume.facts.push(createResumeFact({ id: "fact-project", category: "project", provenance: "user_added", review: { status: "confirmed", updatedAt: NOW }, data: { name: "校园用户研究项目", role: "负责人", actions: ["访谈 20 名用户"], methods: ["用户访谈"], results: ["形成需求清单"], metrics: ["20 名用户"], technologies: ["Figma"] } }));
  const analysis = analyzeCareerProfile(resume, { targetDirection: "product-manager" });
  const applicationTierPlan = createApplicationTierPlan(analysis, null);
  const evidenceDegradation = createEvidenceDegradationPlan(analysis);
  const actionPlan = createActionPlan(analysis, null, applicationTierPlan, { degradationPlan: evidenceDegradation });
  return { analysis, applicationTierPlan, evidenceDegradation, actionPlan };
}

describe("privacy-safe report text export", () => {
  it("exports the complete structured report with versions and boundaries", () => {
    const text = buildPrivacySafeReportText({ ...createInput(), generatedAt: NOW });
    expect(text).toContain("Edutoro 智能求职助手｜脱敏诊断报告");
    expect(text).toContain("【30 秒结论】");
    expect(text).toContain("【核心优势】");
    expect(text).toContain("【主要短板与信息缺口】");
    expect(text).toContain("【四层投递组合】");
    expect(text).toContain("【下一步行动】");
    expect(text).toContain("48 小时：");
    expect(text).toContain("7 天：");
    expect(text).toContain("30 天：");
    expect(text).toContain("【使用边界】");
    expect(text).toContain("生成方式：本地规则生成（非生成式 AI）");
    expect(text).toContain("隐私与保存：敏感内容仅驻留当前页面");
    expect(text).toContain("不构成录用保证");
    expect(text).toContain("信息时效：本次未使用公司资料");
  });

  it("does not include raw resume or personal contact fields", () => {
    const text = buildPrivacySafeReportText({ ...createInput(), generatedAt: NOW, resumeText: "张三 13800138000 privacy@example.com", privateFields: ["张三"] });
    expect(text).not.toContain("张三");
    expect(text).not.toContain("13800138000");
    expect(text).not.toContain("privacy@example.com");
    expect(text).toContain("不包含姓名、联系方式、完整简历原文或原始文件信息");
  });

  it("rejects a missing analysis and invalid generation time", () => {
    expect(() => buildPrivacySafeReportText({})).toThrow(ReportTextExportError);
    expect(() => buildPrivacySafeReportText({ ...createInput(), generatedAt: "not-a-date" })).toThrow(ReportTextExportError);
  });
});
