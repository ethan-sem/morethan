import { describe, expect, it } from "vitest";
import companyRolePool from "../../../public/data/career-copilot/company-role-pool.json";
import sourceWhitelist from "../../../public/data/career-copilot/source-whitelist.json";
import roleFamilyMap from "../../../public/data/career-copilot/role-family-map.json";
import { validateCareerKnowledgeBuild } from "./careerKnowledgeBuildValidation.js";

const currentFiles = () => structuredClone({ companyRolePool, sourceWhitelist, roleFamilyMap });

describe("M5-05 career knowledge build validation", () => {
  it("accepts the current release on its inclusive final valid date", () => {
    const result = validateCareerKnowledgeBuild(currentFiles(), { asOfDate: "2026-08-20" });
    expect(result).toMatchObject({
      valid: true,
      asOfDate: "2026-08-20",
      errors: [],
      warnings: [],
      summary: { companies: 30, companyRoleRecords: 30, whitelistedSources: 36, directions: 6, detailedRoleFamilies: 18 },
    });
  });

  it("rejects invalid validation dates deterministically", () => {
    expect(validateCareerKnowledgeBuild(currentFiles(), { asOfDate: "2026-02-30" }).errors).toContainEqual(expect.objectContaining({ code: "AS_OF_DATE_INVALID", path: "$build.asOfDate" }));
  });

  it("surfaces closed-schema and duplicate errors from the source contracts", () => {
    const files = currentFiles();
    files.companyRolePool.companies[0].unknown = true;
    files.sourceWhitelist.sources[1].id = files.sourceWhitelist.sources[0].id;
    expect(validateCareerKnowledgeBuild(files, { asOfDate: "2026-08-14" }).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ dataset: "companyRolePool", code: "SCHEMA_COMPANY_KEY_UNKNOWN", path: "$.companies[0].unknown" }),
      expect.objectContaining({ dataset: "sourceWhitelist", code: "SCHEMA_SOURCE_ID_DUPLICATE", path: "$.sources[1].id" }),
    ]));
  });

  it("keeps expired sourced data buildable but emits runtime-degradation warnings", () => {
    const result = validateCareerKnowledgeBuild(currentFiles(), { asOfDate: "2026-08-21" });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DATASET_EXPIRED", path: "$.validThrough" }),
      expect.objectContaining({ code: "SOURCE_EXPIRED", path: "$.sources[0].expiresAt" }),
      expect.objectContaining({ code: "ENTRANCE_EXPIRED", path: "$.recruitmentEntrances[0].expiresAt" }),
      expect.objectContaining({ code: "RECORD_EXPIRED", path: "$.records[0].expiresAt" }),
    ]));
  });

  it("enforces each whitelist source review interval", () => {
    const files = currentFiles();
    files.sourceWhitelist.sources[0].reviewIntervalDays = 7;
    expect(validateCareerKnowledgeBuild(files, { asOfDate: "2026-08-21" }).warnings).toContainEqual(expect.objectContaining({ dataset: "sourceWhitelist", code: "SOURCE_REVIEW_OVERDUE", path: "$.sources[0].verifiedAt" }));
  });

  it("rejects company and recruitment URLs outside the exact hostname whitelist", () => {
    const files = currentFiles();
    files.companyRolePool.companies[0].websiteUrl = "https://careers.example.com/campus";
    files.companyRolePool.sources[0].url = "https://careers.example.com/campus";
    files.companyRolePool.recruitmentEntrances[0].url = "https://careers.example.com/campus";
    expect(validateCareerKnowledgeBuild(files, { asOfDate: "2026-08-14" }).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "COMPANY_URL_NOT_WHITELISTED" }),
      expect.objectContaining({ code: "SOURCE_NOT_WHITELISTED" }),
      expect.objectContaining({ code: "ENTRANCE_NOT_WHITELISTED" }),
    ]));
  });

  it("enforces first-release counts and direction coverage", () => {
    const files = currentFiles();
    files.companyRolePool.records.pop();
    const extraRole = structuredClone(files.roleFamilyMap.roleFamilies[0]);
    extraRole.id = "extra-product-role";
    files.roleFamilyMap.roleFamilies.push(extraRole);
    files.roleFamilyMap.directions[0].roleFamilyIds.push(extraRole.id);
    expect(validateCareerKnowledgeBuild(files, { asOfDate: "2026-08-14" }).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "RECORD_COUNT_INVALID", path: "$.records" }),
      expect.objectContaining({ code: "DIRECTION_COVERAGE_INSUFFICIENT" }),
      expect.objectContaining({ code: "ROLE_FAMILY_COUNT_INVALID", path: "$.roleFamilies" }),
      expect.objectContaining({ code: "DIRECTION_ROLE_COUNT_INVALID", path: "$.directions[0].roleFamilyIds" }),
    ]));
  });

  it("rejects direction drift across target pool, role map and analysis profiles", () => {
    const files = currentFiles();
    files.roleFamilyMap.directions[0].id = "product-management-renamed";
    files.roleFamilyMap.directions[0].profileId = "product-management-renamed";
    files.roleFamilyMap.roleFamilies.filter(({ directionId }) => directionId === "product-manager").forEach((role) => { role.directionId = "product-management-renamed"; });
    const errors = validateCareerKnowledgeBuild(files, { asOfDate: "2026-08-14" }).errors;
    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "DIRECTION_SET_MISMATCH", path: "$.directions" })]));
  });

  it("does not mutate source data during validation", () => {
    const files = currentFiles();
    const before = JSON.stringify(files);
    validateCareerKnowledgeBuild(files, { asOfDate: "2026-08-14" });
    expect(JSON.stringify(files)).toBe(before);
  });
});
