import { describe, expect, it } from "vitest";
import { createEmptyResumeFacts, createResumeFact } from "./resumeFacts.js";
import { analyzeCareerProfile, CAREER_PROFILE_ANALYSIS_VERSION, CareerProfileAnalysisError } from "./careerProfileAnalysis.js";

const NOW = "2026-08-13T12:00:00.000Z";

function resumeWithFacts() {
  const resume = createEmptyResumeFacts({ documentId: "doc-profile", format: "paste", characterCount: 200, textLength: 220, now: NOW });
  resume.facts.push(
    createResumeFact({
      id: "fact-confirmed-product",
      category: "project",
      provenance: "user_edited",
      review: { status: "confirmed", updatedAt: NOW },
      data: {
        name: "校园用户研究项目",
        role: "项目负责人",
        dateRange: { start: { value: "2025-03", precision: "month" }, end: { value: "2025-06", precision: "month" }, ongoing: false },
        actions: ["访谈 20 名用户并整理需求"],
        methods: ["用户访谈", "需求分析"],
        results: ["形成覆盖 4 个场景的需求清单"],
        metrics: ["20 名用户", "4 个场景"],
        technologies: ["Figma"],
      },
    }),
    createResumeFact({
      id: "fact-pending-secret",
      category: "internship",
      provenance: "user_added",
      review: { status: "pending", updatedAt: null },
      data: { organization: "待确认公司", role: "运营", actions: ["完成用户增长和活动转化"], results: ["增长 80%"] },
    }),
    createResumeFact({
      id: "fact-uncertain-secret",
      category: "skill",
      provenance: "user_added",
      review: { status: "uncertain", updatedAt: NOW },
      data: { name: "Python", level: "熟练", keywords: ["Python"], evidenceFactIds: [] },
    }),
  );
  return resume;
}

describe("career profile analysis", () => {
  it("uses only confirmed facts and preserves fact-level evidence references", () => {
    const result = analyzeCareerProfile(resumeWithFacts(), { targetDirection: "product-manager" });
    expect(result.schemaVersion).toBe(CAREER_PROFILE_ANALYSIS_VERSION);
    expect(result.factsConsideredIds).toEqual(["fact-confirmed-product"]);
    expect(result.evidence.flatMap((item) => item.factRefs.map((ref) => ref.factId))).not.toContain("fact-pending-secret");
    expect(result.evidence.flatMap((item) => item.factRefs.map((ref) => ref.factId))).not.toContain("fact-uncertain-secret");
    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.strengths.every((item) => item.factIds.includes("fact-confirmed-product"))).toBe(true);
  });

  it("matches an explicit product direction using task and skill keywords", () => {
    const result = analyzeCareerProfile(resumeWithFacts(), { targetDirection: "产品经理" });
    expect(result.direction.selected).toBe("product-manager");
    expect(result.direction.selectedLabel).toBe("产品经理");
    expect(result.direction.status).toBe("matched");
    expect(result.direction.matches.find((item) => item.id === "product-manager")?.matchedKeywords).toEqual(expect.arrayContaining(["用户", "需求", "场景", "Figma"]));
  });

  it("selects the strongest covered role family when the user asks for help", () => {
    const result = analyzeCareerProfile(resumeWithFacts(), { targetDirection: "请先帮我判断" });
    expect(result.direction.requested).toBe("auto");
    expect(result.direction.selected).toBe("product-manager");
    expect(result.direction.matches).toHaveLength(3);
  });

  it("distinguishes resume evidence gaps from claims about real ability", () => {
    const resume = resumeWithFacts();
    resume.facts[0].data.results = [];
    resume.facts[0].data.metrics = [];
    const result = analyzeCareerProfile(resume, { targetDirection: "product-manager" });
    const resultGap = result.gaps.find((item) => item.metric === "result_evidence");
    expect(resultGap?.claim).toContain("缺少结果证据");
    expect(resultGap?.claim).not.toContain("能力不足");
    expect(resultGap?.confidence).toBe("low");
  });

  it("degrades to insufficient conclusions when no confirmed facts exist", () => {
    const resume = resumeWithFacts();
    resume.facts.forEach((fact) => { fact.review = { status: "excluded", updatedAt: NOW }; });
    const result = analyzeCareerProfile(resume, { targetDirection: "data-business-analysis" });
    expect(result.factsConsideredIds).toEqual([]);
    expect(result.direction.status).toBe("insufficient_evidence");
    expect(result.strengths).toEqual([]);
    expect(result.gaps).toEqual([]);
    expect(result.insufficient).toHaveLength(7);
  });

  it("limits output to three strengths and three gaps", () => {
    const result = analyzeCareerProfile(resumeWithFacts(), { targetDirection: "product-manager" });
    expect(result.strengths.length).toBeLessThanOrEqual(3);
    expect(result.gaps.length).toBeLessThanOrEqual(3);
    expect(result.limits).toEqual({ strengths: 3, gaps: 3, actions: 5 });
  });

  it("rejects invalid ResumeFacts instead of analyzing untrusted data", () => {
    const resume = /** @type {any} */ (resumeWithFacts());
    resume.schemaVersion = "unknown";
    expect(() => analyzeCareerProfile(resume)).toThrow(CareerProfileAnalysisError);
    try { analyzeCareerProfile(resume); } catch (error) { expect(/** @type {CareerProfileAnalysisError} */ (error).code).toBe("RESUME_FACTS_INVALID"); }
  });
});
