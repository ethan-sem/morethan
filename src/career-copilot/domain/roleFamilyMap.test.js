import { describe, expect, it } from "vitest";
import roleFamilyMap from "../../../public/data/career-copilot/role-family-map.json";
import companyRolePool from "../../../public/data/career-copilot/company-role-pool.json";
import { ROLE_PROFILES } from "./roleProfiles.js";
import { mapRoleFamily, RoleFamilyMapError, validateRoleFamilyMap } from "./roleFamilyMap.js";

describe("M5-04 role family and direction map", () => {
  it("ships a valid published registry", () => {
    expect(validateRoleFamilyMap(roleFamilyMap)).toEqual({ valid: true, errors: [] });
    expect(roleFamilyMap.status).toBe("published");
  });

  it("covers six release directions with exactly three detailed role families each", () => {
    expect(roleFamilyMap.directions).toHaveLength(6);
    expect(roleFamilyMap.roleFamilies).toHaveLength(18);
    expect(new Set(roleFamilyMap.directions.map(({ id }) => id))).toEqual(new Set(ROLE_PROFILES.map(({ id }) => id)));
    roleFamilyMap.directions.forEach(({ roleFamilyIds }) => expect(roleFamilyIds).toHaveLength(3));
  });

  it("gives every detailed family usable analysis and traceability fields", () => {
    roleFamilyMap.roleFamilies.forEach((role) => {
      expect(role.aliases.length).toBeGreaterThanOrEqual(4);
      expect(role.coreTasks.length).toBeGreaterThanOrEqual(3);
      expect(role.typicalOutputs.length).toBeGreaterThanOrEqual(2);
      expect(role.evidenceSignals.length).toBeGreaterThanOrEqual(3);
      expect(role.jdKeywords.length).toBeGreaterThanOrEqual(6);
      expect(role.sourceIds.length).toBeGreaterThanOrEqual(2);
      expect(role.review.status).toBe("reviewed");
    });
  });

  it("keeps all company-pool broad directions resolvable through the mapping layer", () => {
    const directionIds = new Set(roleFamilyMap.directions.map(({ id }) => id));
    companyRolePool.records.forEach(({ roleFamilyId }) => expect(directionIds.has(roleFamilyId)).toBe(true));
  });

  it("maps an explicit role title before relying on responsibility keywords", () => {
    expect(mapRoleFamily({ roleTitle: "B端产品经理实习生", responsibilityText: "负责用户研究和原型设计" }, roleFamilyMap)).toMatchObject({
      status: "mapped",
      matches: [{ roleFamilyId: "enterprise-product-management", directionId: "product-manager", confidence: "title_alias" }],
    });
  });

  it("can map responsibilities when no standard title is supplied", () => {
    const result = mapRoleFamily({ responsibilityText: "使用 SQL 建立指标体系和数据看板，完成专题分析并支持业务决策" }, roleFamilyMap);
    expect(result.status).toBe("needs_review");
    expect(result.matches[0]).toMatchObject({ roleFamilyId: "data-analytics-bi", directionId: "data-business-analysis", confidence: "keyword_evidence" });
  });

  it("does not recommend a role from company names alone", () => {
    expect(mapRoleFamily({ roleTitle: "华为", responsibilityText: "" }, roleFamilyMap)).toMatchObject({ status: "unmapped", matches: [] });
    expect(roleFamilyMap.mappingPolicy.inputFields).toEqual(["role_title", "responsibility_text"]);
    expect(roleFamilyMap.mappingPolicy.ignoredFields).toEqual(expect.arrayContaining(["company_name", "school_name", "gender", "age"]));
  });

  it("returns at most three candidates and requires review for ambiguous evidence", () => {
    const result = mapRoleFamily({ responsibilityText: "进行用户分层，策划内容活动，分析拉新留存和转化漏斗，并制定品牌传播方案" }, roleFamilyMap);
    expect(result.matches.length).toBeLessThanOrEqual(3);
    expect(result.status).toBe("needs_review");
  });

  it("rejects unknown references, unsafe mapping policy changes and closed-schema fields", () => {
    const invalid = structuredClone(roleFamilyMap);
    invalid.directions[0].roleFamilyIds[0] = "missing-role";
    invalid.roleFamilies[0].adjacentRoleFamilyIds[0] = "missing-adjacent";
    invalid.mappingPolicy.inputFields.push("company_name");
    invalid.roleFamilies[0].companyIds = ["huawei"];
    expect(validateRoleFamilyMap(invalid).errors).toEqual(expect.arrayContaining([
      { code: "DIRECTION_ROLE_FAMILY_UNKNOWN", path: "$.directions[0].roleFamilyIds[0]" },
      { code: "ROLE_FAMILY_ADJACENT_UNKNOWN", path: "$.roleFamilies[0].adjacentRoleFamilyIds[0]" },
      { code: "MAPPING_INPUT_FIELDS_INVALID", path: "$.mappingPolicy.inputFields" },
      { code: "ROLE_FAMILY_KEY_UNKNOWN", path: "$.roleFamilies[0].companyIds" },
    ]));
  });

  it("throws a typed error for an invalid registry", () => {
    expect(() => mapRoleFamily({ roleTitle: "前端开发" }, {})).toThrow(RoleFamilyMapError);
  });
});
