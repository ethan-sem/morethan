import { describe, expect, it } from "vitest";
import { ANALYSIS_RULES_SCHEMA_VERSION, AnalysisRuleSetError, assertAnalysisRuleSet, createDefaultAnalysisRuleSet, validateAnalysisRuleSet } from "./analysisRules.js";

describe("analysis rule set contract", () => {
  it("creates a valid, versioned internship and campus rule set", () => {
    const ruleSet = createDefaultAnalysisRuleSet();
    expect(ruleSet.schemaVersion).toBe(ANALYSIS_RULES_SCHEMA_VERSION);
    expect(ruleSet.stage).toEqual(["internship", "campus"]);
    expect(ruleSet.rules.reduce((sum, rule) => sum + rule.weight, 0)).toBeCloseTo(1);
    expect(validateAnalysisRuleSet(ruleSet)).toEqual({ valid: true, errors: [] });
  });

  it("returns a fresh mutable copy for each analysis session", () => {
    const first = createDefaultAnalysisRuleSet();
    const second = createDefaultAnalysisRuleSet();
    first.rules[0].weight = 0.5;
    expect(second.rules[0].weight).toBe(0.18);
  });

  it("rejects unknown schema versions and closed-schema fields", () => {
    const ruleSet = /** @type {any} */ (createDefaultAnalysisRuleSet());
    ruleSet.schemaVersion = "2.0.0";
    ruleSet.apiKey = "must-never-exist";
    const errors = validateAnalysisRuleSet(ruleSet).errors;
    expect(errors).toContainEqual({ code: "SCHEMA_VERSION_UNSUPPORTED", path: "$.schemaVersion" });
    expect(errors).toContainEqual({ code: "ROOT_KEY_UNKNOWN", path: "$.apiKey" });
  });

  it("requires normalized weights and correctly ordered thresholds", () => {
    const ruleSet = createDefaultAnalysisRuleSet();
    ruleSet.rules[0].weight = 0.5;
    ruleSet.rules[1].thresholds = { strong: 0.4, adequate: 0.7, weak: 0.2 };
    const errors = validateAnalysisRuleSet(ruleSet).errors;
    expect(errors).toContainEqual({ code: "RULE_WEIGHTS_NOT_NORMALIZED", path: "$.rules" });
    expect(errors).toContainEqual({ code: "RULE_THRESHOLDS_ORDER_INVALID", path: "$.rules[1].thresholds" });
  });

  it("rejects evidence references that are not declared in the catalog", () => {
    const ruleSet = createDefaultAnalysisRuleSet();
    ruleSet.rules[0].evidence.required = [/** @type {any} */ ("E-INVENTED")];
    expect(validateAnalysisRuleSet(ruleSet).errors).toContainEqual({ code: "RULE_EVIDENCE_REF_UNKNOWN", path: "$.rules[0].evidence.required[0]" });
  });

  it("requires explicit evidence-insufficiency degradation behavior", () => {
    const ruleSet = createDefaultAnalysisRuleSet();
    ruleSet.rules[0].degradation.onInsufficientEvidence = /** @type {any} */ ("claim_anyway");
    expect(validateAnalysisRuleSet(ruleSet).errors).toContainEqual({ code: "RULE_INSUFFICIENT_ACTION_INVALID", path: "$.rules[0].degradation.onInsufficientEvidence" });
  });

  it("forbids exposing a composite employability score", () => {
    const ruleSet = createDefaultAnalysisRuleSet();
    ruleSet.aggregation.exposeCompositeScore = /** @type {false} */ (true);
    expect(validateAnalysisRuleSet(ruleSet).errors).toContainEqual({ code: "COMPOSITE_SCORE_MUST_BE_HIDDEN", path: "$.aggregation.exposeCompositeScore" });
  });

  it("enforces report conclusion limits", () => {
    const ruleSet = createDefaultAnalysisRuleSet();
    ruleSet.limits = { strengths: 4, gaps: 4, actions: 6 };
    const codes = validateAnalysisRuleSet(ruleSet).errors.map(({ code }) => code);
    expect(codes).toEqual(expect.arrayContaining(["STRENGTH_LIMIT_EXCEEDED", "GAP_LIMIT_EXCEEDED", "ACTION_LIMIT_EXCEEDED"]));
  });

  it("throws a stable error with validation details when asserted", () => {
    const ruleSet = createDefaultAnalysisRuleSet();
    ruleSet.rules = [];
    try {
      assertAnalysisRuleSet(ruleSet);
      throw new Error("expected assertion to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AnalysisRuleSetError);
      expect(/** @type {AnalysisRuleSetError} */ (error).code).toBe("ANALYSIS_RULESET_INVALID");
      expect(/** @type {AnalysisRuleSetError} */ (error).errors).toContainEqual({ code: "RULES_INVALID", path: "$.rules" });
    }
  });
});
