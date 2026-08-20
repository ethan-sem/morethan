import { describe, expect, it } from "vitest";
import sourceWhitelist from "../../../public/data/career-copilot/source-whitelist.json";
import { evaluateSourceClaim, findWhitelistedSource, validateSourceWhitelist } from "./sourceWhitelist.js";

/** @template T @param {T} value @returns {T} */
function clone(value) { return JSON.parse(JSON.stringify(value)); }

describe("SourceWhitelist", () => {
  it("accepts the shipped, manually verified registry", () => {
    expect(validateSourceWhitelist(sourceWhitelist)).toEqual({ valid: true, errors: [] });
    expect(sourceWhitelist.sources).toHaveLength(36);
  });

  it("matches exact approved HTTPS hostnames and rejects lookalikes", () => {
    expect(findWhitelistedSource("https://career.huawei.com/cn/campus-recruitment", sourceWhitelist)?.id).toBe("company-huawei-careers");
    expect(findWhitelistedSource("https://career.huawei.com.evil.example/jobs", sourceWhitelist)).toBeNull();
    expect(findWhitelistedSource("http://career.huawei.com/cn/campus-recruitment", sourceWhitelist)).toBeNull();
  });

  it("allows public guidance claims but not unsupported claim types", () => {
    expect(evaluateSourceClaim("https://job.mohrss.gov.cn/", "career_guidance", sourceWhitelist)).toMatchObject({ allowed: true, code: null });
    expect(evaluateSourceClaim("https://job.mohrss.gov.cn/", "role_details", sourceWhitelist)).toMatchObject({ allowed: false, code: "CLAIM_NOT_ALLOWED" });
  });

  it("requires a manually checked role-level page for live company role claims", () => {
    const withoutCheck = evaluateSourceClaim("https://jobs.bytedance.com/campus/position/123", "role_listing", sourceWhitelist);
    expect(withoutCheck).toMatchObject({ allowed: false, code: "ROLE_LEVEL_VERIFICATION_REQUIRED" });
    expect(evaluateSourceClaim("https://jobs.bytedance.com/campus/position/123", "role_listing", sourceWhitelist, { roleLevelPageVerified: true })).toMatchObject({ allowed: true, code: null });
  });

  it("does not grant university sources authority to prove a live employer role", () => {
    const source = findWhitelistedSource("https://scc.pku.edu.cn/job/123", sourceWhitelist);
    expect(source).toMatchObject({ sourceType: "university", liveStatusAuthority: false });
  });

  it("rejects policies that exceed the manual link-only baseline", () => {
    const invalid = clone(sourceWhitelist);
    invalid.sources[0].usagePolicy = "open_data";
    invalid.sources[0].automationPolicy = "official_api_only";
    expect(validateSourceWhitelist(invalid).errors).toEqual(expect.arrayContaining([
      { code: "SOURCE_USAGE_EXCEEDS_DEFAULT", path: "$.sources[0].usagePolicy" },
      { code: "SOURCE_AUTOMATION_EXCEEDS_DEFAULT", path: "$.sources[0].automationPolicy" },
    ]));
  });

  it("reserves live-status authority for official company career sources", () => {
    const invalid = clone(sourceWhitelist);
    invalid.sources[0].liveStatusAuthority = true;
    expect(validateSourceWhitelist(invalid).errors).toContainEqual({ code: "LIVE_STATUS_AUTHORITY_FORBIDDEN", path: "$.sources[0].liveStatusAuthority" });
  });

  it("rejects an allowed-host list that omits the source base hostname", () => {
    const invalid = clone(sourceWhitelist);
    invalid.sources[0].allowedHostnames = ["example.com"];
    expect(validateSourceWhitelist(invalid).errors).toContainEqual({ code: "SOURCE_BASE_HOST_NOT_ALLOWED", path: "$.sources[0].allowedHostnames" });
  });

  it("keeps a documented exclusion for sources whose public notice forbids reuse", () => {
    expect(sourceWhitelist.exclusions).toContainEqual(expect.objectContaining({ id: "exclude-zju-career" }));
  });
});
