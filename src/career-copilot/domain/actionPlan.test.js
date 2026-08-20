import { describe, expect, it } from "vitest";
import { createEmptyResumeFacts, createResumeFact } from "./resumeFacts.js";
import { analyzeCareerProfile } from "./careerProfileAnalysis.js";
import { extractJdProfile } from "./jdExtractor.js";
import { compareResumeToJd } from "./jdGapAnalysis.js";
import { createApplicationTierPlan } from "./applicationTierPlan.js";
import { ACTION_PLAN_VERSION, ActionPlanError, createActionPlan, validateActionPlan } from "./actionPlan.js";
import { answerEvidenceDegradation, createEvidenceDegradationPlan } from "./evidenceDegradation.js";

const NOW = "2026-08-13T12:00:00.000Z";

function inputs(withJd = true) {
  const resume = createEmptyResumeFacts({ documentId: "doc-actions", format: "paste", characterCount: 160, textLength: 180, now: NOW });
  resume.facts.push(createResumeFact({ id: "fact-project", category: "project", provenance: "user_added", review: { status: "confirmed", updatedAt: NOW }, data: { name: "用户研究项目", role: "负责人", actions: ["开展用户调研"], methods: ["访谈"], results: [], metrics: [], technologies: ["Figma"] } }));
  const career = analyzeCareerProfile(resume, { targetDirection: "product-manager" });
  const jd = withJd ? extractJdProfile("岗位职责\n负责用户调研和需求分析\n任职要求\n熟练使用 SQL\n本科及以上学历\n加分项\n熟悉 Figma 优先", { now: NOW }) : null;
  const gap = jd ? compareResumeToJd(resume, jd) : null;
  const tier = createApplicationTierPlan(career, gap);
  return { career, gap, tier };
}

describe("evidence-driven action plan", () => {
  it("creates no more than five tasks across all three time windows", () => {
    const { career, gap, tier } = inputs();
    const result = createActionPlan(career, gap, tier);
    expect(result.schemaVersion).toBe(ACTION_PLAN_VERSION);
    expect(result.items).toHaveLength(5);
    expect(new Set(result.items.map((item) => item.window))).toEqual(new Set(["48_hours", "7_days", "30_days"]));
    expect(result.items.map((item) => item.priority)).toEqual([1, 2, 3, 4, 5]);
    expect(validateActionPlan(result)).toEqual({ valid: true, errors: [] });
  });

  it("prioritizes missing JD requirements in the first 48 hours", () => {
    const { career, gap, tier } = inputs();
    const result = createActionPlan(career, gap, tier);
    expect(result.items[0].window).toBe("48_hours");
    expect(result.items[0].triggerRule).toBe("jd_gap:not_found");
    expect(result.items[0].title).toContain("硬要求");
    expect(result.items[0].doneCriteria).toEqual(expect.arrayContaining(["没有虚构动作、结果或数据"]));
  });

  it("falls back to collecting sourced JD samples when no JD is provided", () => {
    const { career, gap, tier } = inputs(false);
    const result = createActionPlan(career, gap, tier);
    expect(result.items.some((item) => item.triggerRule === "jd_missing" && item.window === "48_hours")).toBe(true);
    expect(result.items.find((item) => item.triggerRule === "jd_missing")?.deliverable).toContain("带来源");
  });

  it("gives every task a deliverable, done criteria, estimate and traceable trigger", () => {
    const { career, gap, tier } = inputs();
    const result = createActionPlan(career, gap, tier);
    expect(result.items.every((item) => item.deliverable && item.doneCriteria.length > 0 && item.estimatedMinutes >= 15 && item.triggerRule)).toBe(true);
    expect(result.summary.totalEstimatedMinutes).toBe(result.items.reduce((sum, item) => sum + item.estimatedMinutes, 0));
  });

  it("uses real feedback for the 30-day task and avoids guarantee language", () => {
    const { career, gap, tier } = inputs();
    const result = createActionPlan(career, gap, tier);
    const review = result.items.find((item) => item.window === "30_days");
    expect(review?.title).toContain("真实反馈");
    expect(review?.doneCriteria).toContain("不把稳妥层解释为 offer 保证");
    expect(result.disclaimer).toContain("不代表获得面试或 offer");
  });

  it("forbids vague, unbounded and persistence fields through closed validation", () => {
    const { career, gap, tier } = inputs();
    const result = /** @type {any} */ (createActionPlan(career, gap, tier));
    result.items[0].deadline = "someday";
    result.cloudSync = true;
    const errors = validateActionPlan(result).errors;
    expect(errors).toContainEqual({ code: "ITEM_KEY_UNKNOWN", path: "$.items[0].deadline" });
    expect(errors).toContainEqual({ code: "ROOT_KEY_UNKNOWN", path: "$.cloudSync" });
    const invalidSummary = /** @type {any} */ (createActionPlan(career, gap, tier));
    invalidSummary.summary.totalEstimatedMinutes = 1;
    expect(validateActionPlan(invalidSummary).errors).toContainEqual({ code: "SUMMARY_MINUTES_MISMATCH", path: "$.summary.totalEstimatedMinutes" });
  });

  it("rejects mismatched input analyses", () => {
    const { career, gap, tier } = inputs();
    const mismatchedGap = /** @type {any} */ ({ ...gap, documentId: "another-document" });
    expect(() => createActionPlan(career, mismatchedGap, tier)).toThrow(ActionPlanError);
  });

  it("does not turn an omitted profile conclusion into an action trigger", () => {
    const { career, gap, tier } = inputs(false);
    let degradation = createEvidenceDegradationPlan(career);
    const answerable = degradation.items.find((item) => item.configuredAction === "ask_user");
    degradation = answerEvidenceDegradation(degradation, answerable.id, "unsure");
    const result = createActionPlan(career, gap, tier, { degradationPlan: degradation });
    expect(result.items.some((item) => item.triggers.some((trigger) => trigger.id === answerable.conclusionId))).toBe(false);
  });
});
