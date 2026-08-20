import { describe, expect, it } from "vitest";
import companyRolePool from "../../../public/data/career-copilot/company-role-pool.json";
import sourceWhitelist from "../../../public/data/career-copilot/source-whitelist.json";
import { validateCompanyRoleKnowledgeBase } from "./companyRoleKnowledgeBase.js";
import { ROLE_PROFILES } from "./roleProfiles.js";
import { findWhitelistedSource } from "./sourceWhitelist.js";

describe("M5-03 representative company role pool", () => {
  it("ships a valid published knowledge package", () => {
    expect(validateCompanyRoleKnowledgeBase(companyRolePool)).toEqual({ valid: true, errors: [] });
    expect(companyRolePool.status).toBe("published");
  });

  it("contains exactly 30 distinct representative companies", () => {
    expect(companyRolePool.companies).toHaveLength(30);
    expect(new Set(companyRolePool.companies.map(({ id }) => id))).toHaveLength(30);
    expect(new Set(companyRolePool.records.map(({ companyId }) => companyId))).toHaveLength(30);
  });

  it("covers every first-release direction with at least five companies", () => {
    const counts = new Map(companyRolePool.roleFamilies.map(({ id }) => [id, 0]));
    companyRolePool.records.forEach(({ roleFamilyId }) => counts.set(roleFamilyId, (counts.get(roleFamilyId) ?? 0) + 1));
    expect(new Set(companyRolePool.roleFamilies.map(({ id }) => id))).toEqual(new Set(ROLE_PROFILES.map(({ id }) => id)));
    counts.forEach((count) => expect(count).toBeGreaterThanOrEqual(5));
  });

  it("represents multiple industries and organization types", () => {
    const industryTags = new Set(companyRolePool.companies.flatMap(({ tags }) => tags.filter((tag) => tag.startsWith("industry-"))));
    const organizationTypes = new Set(companyRolePool.companies.map(({ organizationType }) => organizationType));
    expect(industryTags.size).toBeGreaterThanOrEqual(8);
    expect(organizationTypes.size).toBeGreaterThanOrEqual(5);
  });

  it("keeps every company and record as a target candidate instead of claiming a live vacancy", () => {
    expect(companyRolePool.records.every(({ status, roleName, locations }) => status === "target_pool" && roleName === null && locations.length === 0)).toBe(true);
    expect(companyRolePool.recruitmentEntrances.every(({ status }) => status === "unknown")).toBe(true);
  });

  it("does not persist permanent tiers, scores or success probabilities", () => {
    const serialized = JSON.stringify(companyRolePool);
    ["tier", "lane", "rank", "score", "successRate", "probability"].forEach((field) => {
      expect(serialized).not.toMatch(new RegExp(`"${field}"\\s*:`));
    });
  });

  it("binds every source and company entrance to a whitelisted HTTPS host", () => {
    companyRolePool.sources.forEach(({ url }) => expect(findWhitelistedSource(url, sourceWhitelist)).not.toBeNull());
    companyRolePool.companies.forEach(({ websiteUrl }) => expect(findWhitelistedSource(websiteUrl, sourceWhitelist)).not.toBeNull());
  });

  it("maintains one reviewed source and entrance chain for every target record", () => {
    const sources = new Map(companyRolePool.sources.map((source) => [source.id, source]));
    const entrances = new Map(companyRolePool.recruitmentEntrances.map((entrance) => [entrance.id, entrance]));
    companyRolePool.records.forEach((record) => {
      expect(record.review.status).toBe("reviewed");
      expect(record.sourceIds).toHaveLength(1);
      expect(record.entranceIds).toHaveLength(1);
      expect(sources.has(record.sourceIds[0])).toBe(true);
      expect(entrances.get(record.entranceIds[0])).toMatchObject({ companyId: record.companyId, recruitmentType: record.recruitmentType });
    });
  });
});
