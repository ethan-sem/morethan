import { describe, expect, it } from "vitest";
import { createEmptyResumeFacts, createResumeFact } from "./resumeFacts.js";
import { extractJdProfile } from "./jdExtractor.js";
import { compareResumeToJd, JD_GAP_ANALYSIS_VERSION, JdGapAnalysisError, validateJdGapAnalysis } from "./jdGapAnalysis.js";

const NOW = "2026-08-13T12:00:00.000Z";

function resume() {
  const value = createEmptyResumeFacts({ documentId: "doc-jd-gap", format: "paste", characterCount: 160, textLength: 180, now: NOW });
  value.facts.push(
    createResumeFact({ id: "fact-project", category: "project", provenance: "user_added", review: { status: "confirmed", updatedAt: NOW }, data: { name: "用户研究项目", role: "负责人", actions: ["开展用户调研和需求分析"], methods: ["访谈"], results: ["形成产品需求清单"], metrics: [], technologies: ["Figma"] } }),
    createResumeFact({ id: "fact-skill", category: "skill", provenance: "user_added", review: { status: "confirmed", updatedAt: NOW }, data: { name: "SQL", level: null, keywords: ["SQL"], evidenceFactIds: [] } }),
    createResumeFact({ id: "fact-pending", category: "skill", provenance: "user_added", data: { name: "Python", level: "熟练", keywords: ["Python"], evidenceFactIds: [] } }),
  );
  return value;
}

function jd() {
  return extractJdProfile(["岗位职责", "负责用户调研和需求分析", "使用 Python 完成数据分析", "任职要求", "熟练使用 SQL", "本科及以上学历", "加分项", "熟悉 Figma 优先"].join("\n"), { now: NOW });
}

describe("resume to JD evidence comparison", () => {
  it("compares every structured JD item and keeps source line references", () => {
    const result = compareResumeToJd(resume(), jd());
    expect(result.schemaVersion).toBe(JD_GAP_ANALYSIS_VERSION);
    expect(result.items).toHaveLength(5);
    expect(result.items.map((item) => item.sourceLine)).toEqual([2, 3, 5, 6, 8]);
    expect(result.summary.total).toBe(5);
    expect(validateJdGapAnalysis(result)).toEqual({ valid: true, errors: [] });
  });

  it("marks experience-backed task evidence as covered", () => {
    const result = compareResumeToJd(resume(), jd());
    const item = result.items.find((entry) => entry.jdText.includes("用户调研"));
    expect(item?.status).toBe("covered");
    expect(item?.matchedKeywords).toEqual(["用户调研", "需求分析"]);
    expect(item?.factRefs).toEqual([{ factId: "fact-project", fieldPaths: ["actions"], matchedKeywords: ["用户调研", "需求分析"] }]);
  });

  it("treats a skill-list-only match as partial evidence", () => {
    const result = compareResumeToJd(resume(), jd());
    const sql = result.items.find((entry) => entry.jdText.includes("SQL"));
    expect(sql?.status).toBe("partial");
    expect(sql?.score).toBe(0.55);
    expect(sql?.interpretation).toContain("部分相关表达");
  });

  it("does not use pending facts and labels missing evidence conservatively", () => {
    const result = compareResumeToJd(resume(), jd());
    const python = result.items.find((entry) => entry.jdText.includes("Python"));
    expect(result.factsConsideredIds).toEqual(["fact-project", "fact-skill"]);
    expect(python?.status).toBe("not_found");
    expect(python?.factRefs).toEqual([]);
    expect(python?.interpretation).toContain("简历事实中未找到");
    expect(result.disclaimer).toContain("不等于不具备能力");
  });

  it("keeps explicit degree requirements unmatched when education evidence is absent", () => {
    const result = compareResumeToJd(resume(), jd());
    const degree = result.items.find((entry) => entry.jdText.includes("本科"));
    expect(degree?.status).toBe("not_found");
    expect(result.summary.requiredNotFound).toBeGreaterThanOrEqual(1);
  });

  it("never exposes probability, employability score or guarantee fields", () => {
    const result = /** @type {any} */ (compareResumeToJd(resume(), jd()));
    expect(result.probability).toBeUndefined();
    expect(result.employabilityScore).toBeUndefined();
    expect(result.guarantee).toBeUndefined();
  });

  it("rejects invalid resume or JD inputs", () => {
    const invalidResume = /** @type {any} */ (resume());
    invalidResume.schemaVersion = "bad";
    expect(() => compareResumeToJd(invalidResume, jd())).toThrow(JdGapAnalysisError);
    const invalidJd = /** @type {any} */ (jd());
    invalidJd.schemaVersion = "bad";
    expect(() => compareResumeToJd(resume(), invalidJd)).toThrow(JdGapAnalysisError);
  });

  it("rejects unknown output fields through closed validation", () => {
    const result = /** @type {any} */ (compareResumeToJd(resume(), jd()));
    result.probability = 0.88;
    expect(validateJdGapAnalysis(result).errors).toContainEqual({ code: "ROOT_KEY_UNKNOWN", path: "$.probability" });
  });
});
