import { describe, expect, it } from "vitest";
import { extractJdProfile, JD_EXTRACTOR_VERSION, JD_PROFILE_SCHEMA_VERSION, JdExtractionError, validateJdProfile } from "./jdExtractor.js";

const JD_TEXT = [
  "产品经理实习生",
  "岗位职责：",
  "1. 负责用户调研与需求分析，协助产品设计和项目管理",
  "2. 使用 SQL 进行数据分析，推动功能迭代",
  "任职要求：",
  "1. 本科及以上学历，每周到岗 4 天",
  "2. 熟练使用 Figma，具备良好的英文沟通能力",
  "加分项：",
  "有互联网产品实习经验者优先",
].join("\n");

describe("JD local extractor", () => {
  it("extracts responsibilities, required and preferred qualifications", () => {
    const result = extractJdProfile(JD_TEXT, { now: "2026-08-13T12:00:00.000Z" });
    expect(result.schemaVersion).toBe(JD_PROFILE_SCHEMA_VERSION);
    expect(result.extractorVersion).toBe(JD_EXTRACTOR_VERSION);
    expect(result.responsibilities).toHaveLength(2);
    expect(result.requirements.required).toHaveLength(2);
    expect(result.requirements.preferred).toHaveLength(1);
    expect(result.coverage).toEqual({ hasResponsibilities: true, hasRequired: true, hasPreferred: true });
    expect(validateJdProfile(result)).toEqual({ valid: true, errors: [] });
  });

  it("extracts task, skill and threshold keywords without inventing synonyms", () => {
    const result = extractJdProfile(JD_TEXT);
    expect(result.keywords.task).toEqual(expect.arrayContaining(["用户调研", "需求分析", "产品设计", "项目管理", "数据分析"]));
    expect(result.keywords.skill).toEqual(expect.arrayContaining(["SQL", "Figma", "英文"]));
    expect(result.keywords.threshold).toEqual(expect.arrayContaining(["本科", "每周", "到岗", "实习", "经验", "天"]));
    expect(result.keywords.skill).not.toContain("Python");
  });

  it("supports common English JD headings and requirements", () => {
    const result = extractJdProfile("Responsibilities\n- Build React features and analyze user data\nRequired Qualifications\n- 1 year experience with JavaScript\nNice to Have\n- SQL preferred");
    expect(result.responsibilities).toHaveLength(1);
    expect(result.requirements.required).toHaveLength(1);
    expect(result.requirements.preferred).toHaveLength(1);
    expect(result.keywords.skill).toEqual(expect.arrayContaining(["React", "JavaScript", "SQL"]));
  });

  it("flags wording that needs cautious verification without making legal claims", () => {
    const result = extractJdProfile("岗位职责\n负责活动运营和用户增长\n任职要求\n每周到岗 5 天，男性优先\n入职前需缴纳培训费\n请提前提供银行卡号");
    expect(result.riskItems.map((item) => item.type)).toEqual(["discriminatory_language", "payment_request", "sensitive_data_request"]);
    expect(result.riskItems.every((item) => item.guidance.includes("建议") || item.guidance.includes("谨慎"))).toBe(true);
  });

  it("does not retain the complete source text in the structured profile", () => {
    const result = /** @type {any} */ (extractJdProfile(JD_TEXT));
    expect(result.rawText).toBeUndefined();
    expect(result.text).toBeUndefined();
    expect(result.source).toEqual({ characterCount: JD_TEXT.length, lineCount: 9 });
  });

  it("rejects empty, excessively short and oversized input", () => {
    expect(() => extractJdProfile(/** @type {any} */ (null))).toThrow(JdExtractionError);
    expect(() => extractJdProfile("招聘产品经理")).toThrowError("JD_TEXT_TOO_SHORT");
    expect(() => extractJdProfile("职位描述\n" + "负责数据分析。".repeat(5000))).toThrowError("JD_TEXT_TOO_LONG");
  });

  it("rejects unknown fields and schema versions", () => {
    const result = /** @type {any} */ (extractJdProfile(JD_TEXT));
    result.schemaVersion = "2.0.0";
    result.rawText = JD_TEXT;
    const errors = validateJdProfile(result).errors;
    expect(errors).toContainEqual({ code: "SCHEMA_VERSION_UNSUPPORTED", path: "$.schemaVersion" });
    expect(errors).toContainEqual({ code: "ROOT_KEY_UNKNOWN", path: "$.rawText" });
  });
});
