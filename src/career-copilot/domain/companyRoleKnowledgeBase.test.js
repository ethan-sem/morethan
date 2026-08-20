import { describe, expect, it } from "vitest";
import blankStaticPackage from "../../../public/data/career-copilot/company-role-pool.json";
import {
  COMPANY_ROLE_KNOWLEDGE_BASE_VERSION,
  createEmptyCompanyRoleKnowledgeBase,
  validateCompanyRoleKnowledgeBase,
} from "./companyRoleKnowledgeBase.js";

function validKnowledgeBase() {
  return {
    schemaVersion: COMPANY_ROLE_KNOWLEDGE_BASE_VERSION,
    datasetVersion: "2026.08.1",
    status: "draft",
    locale: "zh-CN",
    publishedAt: null,
    validThrough: null,
    disclaimer: "岗位状态具有时效性，申请前请再次打开官方来源核验。",
    tagDefinitions: [
      { id: "industry-technology", label: "科技", category: "industry" },
      { id: "location-shanghai", label: "上海", category: "location" },
    ],
    companies: [{
      id: "example-company",
      name: "示例公司",
      aliases: [],
      organizationType: "private",
      websiteUrl: "https://example.com",
      tags: ["industry-technology"],
    }],
    roleFamilies: [{
      id: "product-management",
      label: "产品经理",
      aliases: ["产品实习生"],
      parentId: null,
      tags: [],
    }],
    sources: [{
      id: "source-example-careers",
      type: "company_careers",
      title: "示例公司校园招聘",
      publisher: "示例公司",
      url: "https://example.com/careers/campus",
      capturedAt: "2026-08-01T09:30:00.000Z",
      verifiedAt: "2026-08-01",
      expiresAt: "2026-08-15",
      usagePolicy: "link_only",
      licenseNote: "仅记录公开事实和原始链接，不复制完整职位说明。",
      tags: [],
    }],
    recruitmentEntrances: [{
      id: "entrance-example-campus",
      companyId: "example-company",
      label: "校园招聘入口",
      recruitmentType: "campus",
      url: "https://example.com/careers/campus",
      sourceIds: ["source-example-careers"],
      status: "active",
      capturedAt: "2026-08-01T09:30:00.000Z",
      verifiedAt: "2026-08-01",
      expiresAt: "2026-08-15",
      tags: [],
    }],
    records: [{
      id: "role-example-product-campus",
      companyId: "example-company",
      roleFamilyId: "product-management",
      roleName: "产品经理校招生",
      locations: ["上海"],
      recruitmentType: "campus",
      status: "open",
      entranceIds: ["entrance-example-campus"],
      sourceIds: ["source-example-careers"],
      capturedAt: "2026-08-01T09:30:00.000Z",
      verifiedAt: "2026-08-01",
      expiresAt: "2026-08-15",
      evidenceRequirements: ["岗位原文明确写明校招批次"],
      advisorNotes: [],
      tags: ["location-shanghai"],
      review: { status: "reviewed", reviewedBy: "advisor-01", reviewedAt: "2026-08-01T10:00:00.000Z" },
    }],
  };
}

/** @template T @param {T} value @returns {T} */
function clone(value) { return JSON.parse(JSON.stringify(value)); }

describe("CompanyRoleKnowledgeBase", () => {
  it("accepts the deliberately empty draft and the shipped static package", () => {
    expect(validateCompanyRoleKnowledgeBase(createEmptyCompanyRoleKnowledgeBase())).toEqual({ valid: true, errors: [] });
    expect(validateCompanyRoleKnowledgeBase(blankStaticPackage)).toEqual({ valid: true, errors: [] });
  });

  it("accepts a fully linked official-source campus role", () => {
    expect(validateCompanyRoleKnowledgeBase(validKnowledgeBase())).toEqual({ valid: true, errors: [] });
  });

  it("rejects unknown fields including permanent company tiers and success rates", () => {
    const invalid = validKnowledgeBase();
    Object.assign(invalid.companies[0], { tier: "A" });
    Object.assign(invalid.records[0], { successRate: 0.8 });
    expect(validateCompanyRoleKnowledgeBase(invalid).errors).toEqual(expect.arrayContaining([
      { code: "COMPANY_KEY_UNKNOWN", path: "$.companies[0].tier" },
      { code: "RECORD_KEY_UNKNOWN", path: "$.records[0].successRate" },
    ]));
  });

  it("requires HTTPS sources and ordered capture, verification and expiry dates", () => {
    const invalid = validKnowledgeBase();
    invalid.sources[0].url = "http://example.com/careers";
    invalid.sources[0].capturedAt = "2026-08-10T09:30:00.000Z";
    invalid.sources[0].verifiedAt = "2026-08-09";
    invalid.sources[0].expiresAt = "2026-08-08";
    expect(validateCompanyRoleKnowledgeBase(invalid).errors).toEqual(expect.arrayContaining([
      { code: "SOURCE_URL_INVALID", path: "$.sources[0].url" },
      { code: "SOURCE_VERIFIED_BEFORE_CAPTURE", path: "$.sources[0].verifiedAt" },
      { code: "SOURCE_EXPIRES_BEFORE_VERIFIED", path: "$.sources[0].expiresAt" },
    ]));
  });

  it("rejects dangling company, role, source and tag references", () => {
    const invalid = validKnowledgeBase();
    invalid.records[0].companyId = "missing-company";
    invalid.records[0].roleFamilyId = "missing-role";
    invalid.records[0].sourceIds = ["missing-source"];
    invalid.records[0].tags = ["missing-tag"];
    expect(validateCompanyRoleKnowledgeBase(invalid).errors).toEqual(expect.arrayContaining([
      { code: "RECORD_COMPANY_UNKNOWN", path: "$.records[0].companyId" },
      { code: "RECORD_ROLE_FAMILY_UNKNOWN", path: "$.records[0].roleFamilyId" },
      { code: "RECORD_SOURCE_UNKNOWN", path: "$.records[0].sourceIds[0]" },
      { code: "TAG_UNKNOWN", path: "$.records[0].tags[0]" },
    ]));
  });

  it("does not allow public reference pages alone to assert an open role", () => {
    const invalid = validKnowledgeBase();
    invalid.sources[0].type = "government";
    expect(validateCompanyRoleKnowledgeBase(invalid).errors).toEqual(expect.arrayContaining([
      { code: "ACTIVE_ENTRANCE_OFFICIAL_SOURCE_REQUIRED", path: "$.recruitmentEntrances[0].sourceIds" },
      { code: "OPEN_RECORD_OFFICIAL_SOURCE_REQUIRED", path: "$.records[0].sourceIds" },
    ]));
  });

  it("requires linked entrances to match the record company and recruitment type", () => {
    const invalid = validKnowledgeBase();
    invalid.records[0].recruitmentType = "internship";
    expect(validateCompanyRoleKnowledgeBase(invalid).errors).toContainEqual({
      code: "RECORD_ENTRANCE_TYPE_MISMATCH",
      path: "$.records[0].entranceIds[0]",
    });
  });

  it("requires publication dates, records and review completion for published data", () => {
    const invalidEmpty = createEmptyCompanyRoleKnowledgeBase();
    invalidEmpty.status = "published";
    expect(validateCompanyRoleKnowledgeBase(invalidEmpty).errors).toEqual(expect.arrayContaining([
      { code: "PUBLISHED_DATES_REQUIRED", path: "$." },
      { code: "PUBLISHED_RECORDS_REQUIRED", path: "$.records" },
    ]));

    const valid = clone(validKnowledgeBase());
    valid.status = "published";
    valid.publishedAt = "2026-08-01T12:00:00.000Z";
    valid.validThrough = "2026-08-15";
    expect(validateCompanyRoleKnowledgeBase(valid)).toEqual({ valid: true, errors: [] });

    valid.records[0].review = { status: "draft", reviewedBy: null, reviewedAt: null };
    expect(validateCompanyRoleKnowledgeBase(valid).errors).toContainEqual({
      code: "PUBLISHED_RECORD_REVIEW_REQUIRED",
      path: "$.records[0].review.status",
    });
  });
});
