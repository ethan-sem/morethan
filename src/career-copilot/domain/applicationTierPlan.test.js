import { describe, expect, it } from "vitest";
import { createEmptyResumeFacts, createResumeFact } from "./resumeFacts.js";
import { analyzeCareerProfile } from "./careerProfileAnalysis.js";
import { extractJdProfile } from "./jdExtractor.js";
import { compareResumeToJd } from "./jdGapAnalysis.js";
import { APPLICATION_TIER_PLAN_VERSION, ApplicationTierPlanError, createApplicationTierPlan, validateApplicationTierPlan } from "./applicationTierPlan.js";

const NOW = "2026-08-13T12:00:00.000Z";

function inputs(withJd = true) {
  const resume = createEmptyResumeFacts({ documentId: "doc-tier", format: "paste", characterCount: 160, textLength: 180, now: NOW });
  resume.facts.push(createResumeFact({ id: "fact-project", category: "project", provenance: "user_added", review: { status: "confirmed", updatedAt: NOW }, data: { name: "用户研究项目", role: "负责人", actions: ["开展用户调研和需求分析"], methods: ["访谈"], results: ["形成产品需求清单"], metrics: ["访谈 20 人"], technologies: ["Figma"] } }));
  const career = analyzeCareerProfile(resume, { targetDirection: "product-manager" });
  if (!withJd) return { career, gap: null };
  const jd = extractJdProfile("岗位职责\n负责用户调研和需求分析\n任职要求\n熟练使用 Figma\n本科及以上学历\n加分项\n熟悉 SQL 优先", { now: NOW });
  return { career, gap: compareResumeToJd(resume, jd) };
}

describe("four-tier application strategy", () => {
  it("creates exactly four normalized lanes with stable semantics", () => {
    const { career, gap } = inputs();
    const result = createApplicationTierPlan(career, gap, { recruitmentType: "internship" });
    expect(result.schemaVersion).toBe(APPLICATION_TIER_PLAN_VERSION);
    expect(result.lanes.map((lane) => lane.id)).toEqual(["stretch", "main", "safe", "explore"]);
    expect(result.lanes.reduce((sum, lane) => sum + lane.allocationPercent, 0)).toBe(100);
    expect(validateApplicationTierPlan(result)).toEqual({ valid: true, errors: [] });
  });

  it("uses role and JD evidence as reasons without assigning companies", () => {
    const { career, gap } = inputs();
    const result = /** @type {any} */ (createApplicationTierPlan(career, gap));
    expect(result.strategyBasis).toBe("role_profile_and_jd");
    expect(result.selectedDirection).toEqual({ id: "product-manager", label: "产品经理" });
    expect(result.companyIds).toBeUndefined();
    expect(result.lanes.every((lane) => lane.company === undefined && lane.evidenceFactIds.includes("fact-project") || lane.id === "explore")).toBe(true);
  });

  it("keeps the safe lane conditional when a required JD item lacks evidence", () => {
    const { career, gap } = inputs();
    const result = createApplicationTierPlan(career, gap);
    const safe = result.lanes.find((lane) => lane.id === "safe");
    expect(result.evidenceSummary.requiredNotFound).toBeGreaterThan(0);
    expect(safe?.status).toBe("conditional");
    expect(safe?.caution).toContain("不保证面试、录取或 offer");
  });

  it("degrades gracefully without a JD and asks for concrete samples", () => {
    const { career } = inputs(false);
    const result = createApplicationTierPlan(career, null, { recruitmentType: "campus" });
    expect(result.strategyBasis).toBe("role_profile");
    expect(result.recruitmentType).toBe("campus");
    expect(result.lanes.find((lane) => lane.id === "main")?.condition).toContain("3–5 份同类岗位描述");
    expect(result.lanes.find((lane) => lane.id === "safe")?.status).toBe("conditional");
  });

  it("uses an adjacent evidenced direction only for exploration", () => {
    const { career, gap } = inputs();
    const result = createApplicationTierPlan(career, gap);
    const explore = result.lanes.find((lane) => lane.id === "explore");
    expect(explore?.targetRoleProfileId).not.toBe("product-manager");
    expect(explore?.caution).toContain("不应为了匹配岗位虚构经历");
  });

  it("forbids probability and permanent company tier fields", () => {
    const { career, gap } = inputs();
    const result = /** @type {any} */ (createApplicationTierPlan(career, gap));
    result.offerProbability = 0.8;
    result.companyPermanentTier = "safe";
    const errors = validateApplicationTierPlan(result).errors;
    expect(errors).toContainEqual({ code: "ROOT_KEY_UNKNOWN", path: "$.offerProbability" });
    expect(errors).toContainEqual({ code: "ROOT_KEY_UNKNOWN", path: "$.companyPermanentTier" });
  });

  it("rejects mismatched analysis documents", () => {
    const { career, gap } = inputs();
    const mismatched = /** @type {any} */ ({ ...gap, documentId: "another-document" });
    expect(() => createApplicationTierPlan(career, mismatched)).toThrow(ApplicationTierPlanError);
    try { createApplicationTierPlan(career, mismatched); } catch (error) { expect(/** @type {ApplicationTierPlanError} */ (error).code).toBe("ANALYSIS_DOCUMENT_MISMATCH"); }
  });
});
