import { describe, expect, it, vi } from "vitest";
import index from "../../../public/data/career-copilot/company-role-pool-index.json";
import productManagerPool from "../../../public/data/career-copilot/by-direction/product-manager.json";
import { CompanyRolePoolLoadError, loadCompanyRolePoolByDirection } from "./companyRolePoolLoader.js";

function jsonResponse(body, ok = true) { return { ok, json: async () => structuredClone(body) }; }

describe("company role pool staged loader", () => {
  it("requests only the index and selected public direction without user material", async () => {
    const fetcher = vi.fn(async (url) => String(url).includes("company-role-pool-index") ? jsonResponse(index) : jsonResponse(productManagerPool));
    const result = await loadCompanyRolePoolByDirection("product-manager", { fetcher, baseUrl: "https://example.test/app/" });
    expect(result.roleFamilies.map(({ id }) => id)).toEqual(["product-manager"]);
    expect(result.records).toHaveLength(5);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const requests = fetcher.mock.calls.map(([url]) => String(url));
    const policies = fetcher.mock.calls.map(([, init]) => init);
    expect(requests[1]).toContain("/data/career-copilot/by-direction/product-manager.json?v=2026.08.1");
    expect(requests.join(" ")).not.toMatch(/resume|jdText|fact-|apiKey/i);
    expect(requests.every((url) => new URL(url).origin === "https://example.test")).toBe(true);
    expect(policies).toEqual([
      { method: "GET", cache: "no-cache", credentials: "same-origin", redirect: "error", referrerPolicy: "no-referrer" },
      { method: "GET", cache: "force-cache", credentials: "same-origin", redirect: "error", referrerPolicy: "no-referrer" },
    ]);
    expect(policies.every((init) => !("body" in init) && !("headers" in init))).toBe(true);
  });

  it("rejects unsupported directions and malformed slices", async () => {
    await expect(loadCompanyRolePoolByDirection("private-direction", { fetcher: vi.fn(), baseUrl: "https://example.test/" })).rejects.toBeInstanceOf(CompanyRolePoolLoadError);
    const fetcher = vi.fn(async (url) => String(url).includes("index") ? jsonResponse(index) : jsonResponse({}));
    await expect(loadCompanyRolePoolByDirection("product-manager", { fetcher, baseUrl: "https://example.test/" })).rejects.toMatchObject({ code: "SLICE_INVALID" });
  });
});
