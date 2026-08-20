import { describe, expect, it } from "vitest";
import companyRolePool from "../../../public/data/career-copilot/company-role-pool.json";
import { createCompanyRoleRecommendations, validateCompanyRoleRecommendations } from "./companyRoleRecommendations.js";

describe("M5-06 company role recommendations", () => {
  it("returns five current sourced targets for a covered direction", () => {
    const result = createCompanyRoleRecommendations(companyRolePool, { directionId: "product-manager", recruitmentType: "internship", asOfDate: "2026-08-14" });
    expect(validateCompanyRoleRecommendations(result)).toEqual({ valid: true, errors: [] });
    expect(result).toMatchObject({ status: "current", direction: { id: "product-manager", label: "产品经理" } });
    expect(result.candidates).toHaveLength(5);
    expect(result.candidates.every(({ verification }) => verification.status === "current")).toBe(true);
  });

  it("prioritizes the requested recruitment type without excluding the other early-career type", () => {
    const result = createCompanyRoleRecommendations(companyRolePool, { directionId: "product-manager", recruitmentType: "internship", asOfDate: "2026-08-14" });
    const types = result.candidates.map(({ recruitmentType }) => recruitmentType);
    expect(types.slice(0, 3)).toEqual(["internship", "internship", "campus"]);
    expect(new Set(types)).toEqual(new Set(["internship", "campus"]));
  });

  it("preserves official source, entrance and review dates on every card", () => {
    const result = createCompanyRoleRecommendations(companyRolePool, { directionId: "software-engineering", asOfDate: "2026-08-14" });
    result.candidates.forEach((candidate) => {
      expect(candidate.source.url).toMatch(/^https:\/\//);
      expect(candidate.entrance.url).toMatch(/^https:\/\//);
      expect(candidate.source.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(candidate.verification.expiresAt).toBe("2026-08-20");
      expect(candidate.caveat).toMatch(/具体岗位、地点.*仍需申请前确认/);
    });
  });

  it("downgrades every target after expiry instead of hiding its source", () => {
    const result = createCompanyRoleRecommendations(companyRolePool, { directionId: "product-operations", asOfDate: "2026-08-21" });
    expect(result.status).toBe("needs_verification");
    result.candidates.forEach((candidate) => {
      expect(candidate.verification.status).toBe("needs_verification");
      expect(candidate.verification.reasons).toEqual(expect.arrayContaining(["dataset_expired", "record_expired", "source_expired", "entrance_expired"]));
      expect(candidate.source.url).toMatch(/^https:\/\//);
      expect(candidate.caveat).toMatch(/自行确认/);
    });
  });

  it("treats the expiry date itself as current", () => {
    const result = createCompanyRoleRecommendations(companyRolePool, { directionId: "finance-accounting", asOfDate: "2026-08-20" });
    expect(result.status).toBe("current");
  });

  it("returns unavailable for an uncovered direction without inventing companies", () => {
    expect(createCompanyRoleRecommendations(companyRolePool, { directionId: "not-covered", asOfDate: "2026-08-14" })).toMatchObject({ status: "unavailable", direction: null, candidates: [] });
  });

  it("applies company, city and industry exclusions locally and preserves location context", () => {
    const result = createCompanyRoleRecommendations(companyRolePool, {
      directionId: "marketing-growth",
      recruitmentType: "internship",
      asOfDate: "2026-08-14",
      targetLocations: ["上海", "深圳"],
      excludedCompanies: ["百度"],
      excludedLocations: ["深圳"],
      excludedIndustries: ["消费品"],
    });
    expect(result.filters).toEqual({ targetLocations: ["上海"], excludedCompanies: ["百度"], excludedLocations: ["深圳"], excludedIndustries: ["消费品"] });
    expect(result.candidates.some(({ company }) => company.name === "百度")).toBe(false);
    expect(result.candidates.every(({ industryTags }) => industryTags.every(({ label }) => label !== "消费品"))).toBe(true);
    expect(result.candidates.every(({ targetLocations }) => targetLocations.join() === "上海")).toBe(true);
    expect(validateCompanyRoleRecommendations(result)).toEqual({ valid: true, errors: [] });
  });

  it("never adds tier, score, rank, probability or live-vacancy claims", () => {
    const serialized = JSON.stringify(createCompanyRoleRecommendations(companyRolePool, { directionId: "data-business-analysis", asOfDate: "2026-08-14" }));
    ["tier", "score", "rank", "probability", "successRate", "open"].forEach((field) => expect(serialized).not.toMatch(new RegExp(`"${field}"\\s*:`)));
  });

  it("rejects invalid dates, limits and malformed knowledge data", () => {
    expect(() => createCompanyRoleRecommendations(companyRolePool, { directionId: "product-manager", asOfDate: "2026-02-30" })).toThrow(/AS_OF_DATE_INVALID/);
    expect(() => createCompanyRoleRecommendations(companyRolePool, { directionId: "product-manager", limit: 20 })).toThrow(/LIMIT_INVALID/);
    expect(() => createCompanyRoleRecommendations({}, { directionId: "product-manager" })).toThrow(/KNOWLEDGE_BASE_INVALID/);
  });
});
