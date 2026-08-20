import { describe, expect, it } from "vitest";
import { createDefaultAnalysisRuleSet } from "./analysisRules.js";
import { analyzeCareerProfile } from "./careerProfileAnalysis.js";
import { DEGRADATION_OUTCOMES, EVIDENCE_DEGRADATION_VERSION, EvidenceDegradationError, answerEvidenceDegradation, createEvidenceDegradationPlan, validateEvidenceDegradationPlan } from "./evidenceDegradation.js";
import { createEmptyResumeFacts, createResumeFact } from "./resumeFacts.js";

const NOW = "2026-08-13T12:00:00.000Z";

function weakAnalysis(ruleSet = undefined) {
  const resume = createEmptyResumeFacts({ documentId: "doc-degradation", format: "paste", characterCount: 120, textLength: 140, now: NOW });
  resume.facts.push(createResumeFact({ id: "fact-project", category: "project", provenance: "user_added", review: { status: "confirmed", updatedAt: NOW }, data: { name: "校园调研", role: "成员", actions: ["访谈用户"], methods: [], results: [], metrics: [], technologies: [] } }));
  return analyzeCareerProfile(resume, { targetDirection: "product-manager", ...(ruleSet ? { ruleSet } : {}) });
}

describe("evidence insufficiency degradation", () => {
  it("turns missing required evidence into at most three answerable questions", () => {
    const result = createEvidenceDegradationPlan(weakAnalysis());
    expect(result.schemaVersion).toBe(EVIDENCE_DEGRADATION_VERSION);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThanOrEqual(3);
    expect(result.items.some((item) => item.configuredAction === "ask_user" && item.question && item.outcome === "pending_question")).toBe(true);
    expect(result.items.every((item) => ["pending_question", "conditional_advice", "omitted"].includes(item.outcome))).toBe(true);
    expect(validateEvidenceDegradationPlan(result)).toEqual({ valid: true, errors: [] });
  });

  it("does not turn a positive answer into a confirmed fact", () => {
    const plan = createEvidenceDegradationPlan(weakAnalysis());
    const item = plan.items.find((entry) => entry.configuredAction === "ask_user");
    expect(item).toBeTruthy();
    const result = answerEvidenceDegradation(plan, item.id, "has_evidence");
    const answered = result.items.find((entry) => entry.id === item.id);
    expect(answered?.outcome).toBe("needs_fact_update");
    expect(answered?.factIds).toEqual(item.factIds);
    expect(answered?.displayText).toContain("完成确认前");
  });

  it("uses conditional advice when evidence is unavailable", () => {
    const plan = createEvidenceDegradationPlan(weakAnalysis());
    const item = plan.items.find((entry) => entry.configuredAction === "ask_user");
    const result = answerEvidenceDegradation(plan, item.id, "not_available");
    const answered = result.items.find((entry) => entry.id === item.id);
    expect(answered.outcome).toBe("conditional_advice");
    expect(answered.displayText).toMatch(/不要|优先|只投递|先以少量|删减/);
  });

  it("omits a conclusion when the user cannot confirm it", () => {
    const plan = createEvidenceDegradationPlan(weakAnalysis());
    const item = plan.items.find((entry) => entry.configuredAction === "ask_user");
    const result = answerEvidenceDegradation(plan, item.id, "unsure");
    const answered = result.items.find((entry) => entry.id === item.id);
    expect(answered.outcome).toBe("omitted");
    expect(answered.displayText).not.toContain("能力不足");
  });

  it("honors configured conditional and omit actions", () => {
    const conditionalRules = createDefaultAnalysisRuleSet();
    conditionalRules.rules[1].degradation.onMissingRequiredEvidence = "conditional_advice";
    const conditional = createEvidenceDegradationPlan(weakAnalysis(conditionalRules), { ruleSet: conditionalRules });
    expect(conditional.items.some((item) => item.ruleId === "rule-method" && item.outcome === "conditional_advice")).toBe(true);

    const omitRules = createDefaultAnalysisRuleSet();
    omitRules.rules[1].degradation.onMissingRequiredEvidence = "omit_conclusion";
    const omitted = createEvidenceDegradationPlan(weakAnalysis(omitRules), { ruleSet: omitRules });
    expect(omitted.items.some((item) => item.ruleId === "rule-method" && item.outcome === "omitted")).toBe(true);
  });

  it("rejects invalid answers and inconsistent outcomes", () => {
    const plan = createEvidenceDegradationPlan(weakAnalysis());
    const answerable = plan.items.find((entry) => entry.configuredAction === "ask_user");
    expect(() => answerEvidenceDegradation(plan, answerable.id, /** @type {any} */ ("invent_fact"))).toThrow(EvidenceDegradationError);
    const invalid = /** @type {any} */ (structuredClone(plan));
    const answerableIndex = invalid.items.findIndex((entry) => entry.configuredAction === "ask_user");
    invalid.items[answerableIndex].outcome = DEGRADATION_OUTCOMES[3];
    invalid.cloudSync = true;
    const errors = validateEvidenceDegradationPlan(invalid).errors;
    expect(errors).toContainEqual({ code: "OUTCOME_MISMATCH", path: `$.items[${answerableIndex}].outcome` });
    expect(errors).toContainEqual({ code: "ROOT_KEY_UNKNOWN", path: "$.cloudSync" });
  });
});
