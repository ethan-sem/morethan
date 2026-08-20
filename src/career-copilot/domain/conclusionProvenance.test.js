import { describe, expect, it } from "vitest";
import { createActionPlan } from "./actionPlan.js";
import { createApplicationTierPlan } from "./applicationTierPlan.js";
import { analyzeCareerProfile } from "./careerProfileAnalysis.js";
import { CONCLUSION_PROVENANCE_VERSION, ConclusionProvenanceError, createConclusionProvenance, findConclusionProvenance, validateConclusionProvenance } from "./conclusionProvenance.js";
import { compareResumeToJd } from "./jdGapAnalysis.js";
import { extractJdProfile } from "./jdExtractor.js";
import { createEmptyResumeFacts, createResumeFact } from "./resumeFacts.js";

const NOW = "2026-08-13T12:00:00.000Z";

function inputs(withJd = true) {
  const resume = createEmptyResumeFacts({ documentId: "doc-provenance", format: "paste", characterCount: 180, textLength: 200, now: NOW });
  resume.facts.push(createResumeFact({ id: "fact-project", category: "project", provenance: "user_added", review: { status: "confirmed", updatedAt: NOW }, data: { name: "用户研究项目", role: "负责人", actions: ["访谈用户并整理需求"], methods: ["用户访谈"], results: [], metrics: [], technologies: ["Figma"] } }));
  const career = analyzeCareerProfile(resume, { targetDirection: "product-manager" });
  const jd = withJd ? extractJdProfile("岗位职责\n负责用户调研和需求分析\n任职要求\n熟练使用 SQL\n本科及以上学历", { now: NOW }) : null;
  const gap = jd ? compareResumeToJd(resume, jd) : null;
  const tier = createApplicationTierPlan(career, gap);
  const action = createActionPlan(career, gap, tier);
  return { career, gap, tier, action };
}

describe("conclusion provenance", () => {
  it("indexes every report and action conclusion without changing upstream contracts", () => {
    const { career, gap, tier, action } = inputs();
    const result = createConclusionProvenance(career, gap, tier, action);
    const expectedTotal = career.strengths.length + career.gaps.length + career.insufficient.length + gap.items.length + tier.lanes.length + action.items.length;
    expect(result.schemaVersion).toBe(CONCLUSION_PROVENANCE_VERSION);
    expect(result.items).toHaveLength(expectedTotal);
    expect(result.summary).toEqual({ total: expectedTotal, confirmedFact: expect.any(Number), ruleInference: expectedTotal, publicSource: 0 });
    expect(validateConclusionProvenance(result)).toEqual({ valid: true, errors: [] });
  });

  it("marks a fact-backed conclusion as both confirmed fact and rule inference", () => {
    const { career, gap, tier, action } = inputs();
    const result = createConclusionProvenance(career, gap, tier, action);
    const conclusion = career.strengths[0] ?? career.gaps.find((item) => item.factIds.length > 0);
    expect(conclusion).toBeTruthy();
    const source = findConclusionProvenance(result, "profile_conclusion", conclusion.id);
    expect(source?.sourceTypes).toEqual(["confirmed_fact", "rule_inference"]);
    expect(source?.factIds).toContain("fact-project");
    expect(source?.ruleIds).toContain(conclusion.ruleId);
  });

  it("does not label a missing-evidence conclusion as confirmed fact", () => {
    const { career, gap, tier, action } = inputs();
    const result = createConclusionProvenance(career, gap, tier, action);
    const missing = gap.items.find((item) => item.status === "not_found");
    const source = findConclusionProvenance(result, "jd_gap", missing.id);
    expect(source?.sourceTypes).toEqual(["rule_inference"]);
    expect(source?.factIds).toEqual([]);
  });

  it("adds public-source provenance only for a verified HTTPS binding", () => {
    const { career, gap, tier, action } = inputs();
    const source = { id: "source-001", title: "示例公司招聘官网", url: "https://careers.example.com/role", verifiedAt: "2026-08-13" };
    const result = createConclusionProvenance(career, gap, tier, action, [{ targetType: "tier_lane", targetId: "main", sources: [source] }]);
    expect(findConclusionProvenance(result, "tier_lane", "main")?.sourceTypes).toEqual(["confirmed_fact", "rule_inference", "public_source"]);
    expect(result.summary.publicSource).toBe(1);
    expect(() => createConclusionProvenance(career, gap, tier, action, [{ targetType: "tier_lane", targetId: "main", sources: [{ ...source, url: "http://careers.example.com/role" }] }])).toThrow(ConclusionProvenanceError);
    expect(() => createConclusionProvenance(career, gap, tier, action, [{ targetType: "tier_lane", targetId: "unknown", sources: [source] }])).toThrow(ConclusionProvenanceError);
  });

  it("rejects a public-source label without a source and unknown fields", () => {
    const { career, gap, tier, action } = inputs(false);
    const result = /** @type {any} */ (createConclusionProvenance(career, gap, tier, action));
    result.items[0].sourceTypes.push("public_source");
    result.items[0].generatedBy = "ai";
    const errors = validateConclusionProvenance(result).errors;
    expect(errors).toContainEqual({ code: "PUBLIC_SOURCE_MISMATCH", path: "$.items[0].sourceTypes" });
    expect(errors).toContainEqual({ code: "ITEM_KEY_UNKNOWN", path: "$.items[0].generatedBy" });
  });

  it("rejects analysis from a different document", () => {
    const { career, gap, tier, action } = inputs();
    expect(() => createConclusionProvenance(career, { ...gap, documentId: "different-document" }, tier, action)).toThrow(ConclusionProvenanceError);
  });
});
