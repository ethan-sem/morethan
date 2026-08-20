import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import companyRolePool from "../../public/data/career-copilot/company-role-pool.json";
import { createActionPlan, validateActionPlan } from "./domain/actionPlan.js";
import { analyzeCareerProfile } from "./domain/careerProfileAnalysis.js";
import { createApplicationTierPlan, validateApplicationTierPlan } from "./domain/applicationTierPlan.js";
import { createCompanyRoleRecommendations } from "./domain/companyRoleRecommendations.js";
import { createConclusionProvenance, validateConclusionProvenance } from "./domain/conclusionProvenance.js";
import { createEvidenceDegradationPlan, validateEvidenceDegradationPlan } from "./domain/evidenceDegradation.js";
import { extractJdProfile } from "./domain/jdExtractor.js";
import { compareResumeToJd, validateJdGapAnalysis } from "./domain/jdGapAnalysis.js";
import { buildPrivacySafeReportText } from "./domain/reportTextExport.js";
import { completeResumeFactsReview, setFactReviewStatus, setTimelineFlagStatus } from "./domain/resumeFactsReview.js";
import { extractResumeFacts } from "./extractors/resumeFactsExtractor.js";
import { detectPrivateFields } from "./privacy/piiDetector.js";

const FIXTURE_ROOT = join(process.cwd(), "test-fixtures", "career-copilot");
const MANIFEST = JSON.parse(readFileSync(join(FIXTURE_ROOT, "manifest.json"), "utf8"));
const NOW = "2026-08-14T00:00:00.000Z";
const ANALYZABLE_RESUMES = MANIFEST.entries.filter((entry) => entry.kind === "resume" && !entry.scenarios.includes("blank_input"));

describe("release pipeline over synthetic fixtures", () => {
  it.each(ANALYZABLE_RESUMES)("builds bounded local analysis for $id", (entry) => {
    const reviewedFacts = extractAndConfirmResume(entry);
    const analysis = analyzeCareerProfile(reviewedFacts, { targetDirection: "auto" });
    const degradation = createEvidenceDegradationPlan(analysis);
    const tierPlan = createApplicationTierPlan(analysis, null, { recruitmentType: "internship" });
    const actionPlan = createActionPlan(analysis, null, tierPlan, { degradationPlan: degradation });
    const provenance = createConclusionProvenance(analysis, null, tierPlan, actionPlan);

    expect(analysis.factsConsideredIds).toHaveLength(reviewedFacts.facts.length);
    expect(analysis.strengths.length).toBeLessThanOrEqual(3);
    expect(analysis.gaps.length).toBeLessThanOrEqual(3);
    expect(validateEvidenceDegradationPlan(degradation).valid).toBe(true);
    expect(validateApplicationTierPlan(tierPlan).valid).toBe(true);
    expect(validateActionPlan(actionPlan).valid).toBe(true);
    expect(validateConclusionProvenance(provenance).valid).toBe(true);
    expect(actionPlan.items.length).toBeGreaterThanOrEqual(3);
    expect(actionPlan.items.length).toBeLessThanOrEqual(5);
    expect(new Set(actionPlan.items.map((item) => item.window))).toEqual(new Set(["48_hours", "7_days", "30_days"]));
    expect(JSON.stringify({ analysis, degradation, tierPlan, actionPlan, provenance })).not.toMatch(/录取概率\s*[:：]\s*\d|offer\s*保证\s*[:：]\s*是/iu);
  });

  it("carries a synthetic cross-major resume through JD comparison, sourced targets and export", () => {
    const resumeEntry = findEntry("resume-cross-major-product");
    const jdEntry = findEntry("jd-product-high-match");
    const reviewedFacts = extractAndConfirmResume(resumeEntry);
    const analysis = analyzeCareerProfile(reviewedFacts, { targetDirection: "product-manager" });
    const jdProfile = extractJdProfile(readFixture(jdEntry), { now: NOW });
    const jdGap = compareResumeToJd(reviewedFacts, jdProfile);
    const degradation = createEvidenceDegradationPlan(analysis);
    const tierPlan = createApplicationTierPlan(analysis, jdGap, { recruitmentType: "internship" });
    const actionPlan = createActionPlan(analysis, jdGap, tierPlan, { degradationPlan: degradation });
    const provenance = createConclusionProvenance(analysis, jdGap, tierPlan, actionPlan);
    const companies = createCompanyRoleRecommendations(companyRolePool, { directionId: analysis.direction.selected, recruitmentType: "internship", asOfDate: "2026-08-14" });
    const report = buildPrivacySafeReportText({ analysis, jdGapAnalysis: jdGap, applicationTierPlan: tierPlan, actionPlan, companyRoleRecommendations: companies, evidenceDegradation: degradation, generatedAt: NOW });

    expect(validateJdGapAnalysis(jdGap).valid).toBe(true);
    expect(jdGap.summary.covered + jdGap.summary.partial).toBeGreaterThan(0);
    expect(companies.candidates).toHaveLength(5);
    expect(companies.candidates.every((candidate) => candidate.source.url.startsWith("https://") && candidate.source.verifiedAt)).toBe(true);
    expect(provenance.summary.ruleInference).toBeGreaterThan(0);
    expect(report).toContain("【简历 × JD】");
    expect(report).toContain("【公司目标池】");
    expect(report).toContain("本地规则生成（非生成式 AI）");
    expect(report).toContain("不构成录用保证");
    expect(report).not.toContain("# SYNTHETIC FIXTURE");
  });

  it("reports conservative gaps for a deliberately mismatched JD", () => {
    const reviewedFacts = extractAndConfirmResume(findEntry("resume-cross-major-product"));
    const jdGap = compareResumeToJd(reviewedFacts, extractJdProfile(readFixture(findEntry("jd-quant-low-match")), { now: NOW }));
    expect(jdGap.summary.notFound).toBeGreaterThan(0);
    expect(jdGap.summary.requiredNotFound).toBeGreaterThan(0);
    expect(jdGap.disclaimer).toContain("未找到");
    expect(jdGap.disclaimer).toContain("不代表录取概率或录用保证");
    expect(jdGap).not.toHaveProperty("admissionProbability");
    expect(jdGap).not.toHaveProperty("successRate");
    expect(jdGap.items.every((item) => !Object.keys(item).some((key) => /probability|chance|guarantee/iu.test(key)))).toBe(true);
  });

  it("keeps dense contact values out of facts and exported conclusions", () => {
    const entry = findEntry("resume-dense-contacts-table");
    const text = readFixture(entry);
    const privateFields = detectPrivateFields(text, { documentId: entry.id });
    expect(privateFields.map((field) => field.type)).toEqual(expect.arrayContaining(["email", "phone"]));
    const reviewedFacts = extractAndConfirmResume(entry);
    const analysis = analyzeCareerProfile(reviewedFacts, { targetDirection: "product-manager" });
    const tierPlan = createApplicationTierPlan(analysis);
    const degradation = createEvidenceDegradationPlan(analysis);
    const actionPlan = createActionPlan(analysis, null, tierPlan, { degradationPlan: degradation });
    const report = buildPrivacySafeReportText({ analysis, applicationTierPlan: tierPlan, actionPlan, evidenceDegradation: degradation, generatedAt: NOW });
    const combined = JSON.stringify(reviewedFacts.facts) + report;
    expect(combined).not.toContain("fixture.candidate@example.invalid");
    expect(combined).not.toContain("010-00000000");
  });
});

function extractAndConfirmResume(entry) {
  const text = readFixture(entry);
  const privateFields = detectPrivateFields(text, { documentId: entry.id });
  let facts = extractResumeFacts({ text, documentId: entry.id, format: "txt", characterCount: text.replace(/\s/gu, "").length, privateFields, now: NOW });
  for (const fact of facts.facts) facts = setFactReviewStatus(facts, fact.id, "confirmed", NOW);
  for (const flag of facts.timelineFlags) facts = setTimelineFlagStatus(facts, flag.id, "dismissed", NOW);
  return completeResumeFactsReview(facts, NOW);
}

function findEntry(id) { return MANIFEST.entries.find((entry) => entry.id === id); }
function readFixture(entry) { return readFileSync(join(FIXTURE_ROOT, entry.file), "utf8"); }
