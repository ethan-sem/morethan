import { describe, expect, it } from "vitest";
import { createReportDisclosure, REPORT_DISCLOSURE_VERSION } from "./reportDisclosure.js";

describe("report disclosure", () => {
  it("identifies the MVP as local deterministic rules rather than generative AI", () => {
    const disclosure = createReportDisclosure();
    expect(disclosure.version).toBe(REPORT_DISCLOSURE_VERSION);
    expect(disclosure.generation.badge).toBe("本地规则生成（非生成式 AI）");
    expect(disclosure.generation.text).toContain("不调用生成式 AI");
    expect(disclosure.generation.text).toContain("不会把简历发送给模型服务");
  });

  it("states the memory-only privacy and non-admission boundaries", () => {
    const disclosure = createReportDisclosure();
    expect(disclosure.privacy.text).toContain("只保留在当前页面内存");
    expect(disclosure.privacy.text).toContain("仅非敏感的流程位置");
    expect(disclosure.outcome.text).toContain("录用概率或 offer 保证");
  });

  it("distinguishes current, stale and unused public data", () => {
    expect(createReportDisclosure({ hasCompanyData: true, asOfDate: "2026-08-14" }).freshness).toMatchObject({ status: "current", asOfDate: "2026-08-14" });
    expect(createReportDisclosure({ hasCompanyData: true, companyDataNeedsVerification: true, asOfDate: "2026-08-14" }).freshness.badge).toContain("待自行核实");
    expect(createReportDisclosure().freshness.status).toBe("not_used");
  });
});
