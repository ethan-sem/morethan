import { describe, expect, it } from "vitest";
import { cases } from "./caseData.js";

describe("proof case distribution", () => {
  it("contains 64 complete, uniquely keyed case cards", () => {
    expect(cases).toHaveLength(64);
    expect(new Set(cases.map((item) => `${item.company}-${item.role}`)).size).toBe(64);
    cases.forEach((item) => {
      expect(item).toEqual(expect.objectContaining({
        company: expect.any(String),
        role: expect.any(String),
        profile: expect.any(String),
        result: expect.any(String),
        group: expect.any(String),
        industry: expect.any(String),
      }));
    });
  });

  it("uses the closest whole-case split to 50/20/20/10", () => {
    const counts = cases.reduce((totals, item) => ({ ...totals, [item.group]: (totals[item.group] ?? 0) + 1 }), {});
    expect(counts).toEqual({
      internet: 32,
      consumer: 13,
      business: 13,
      other: 6,
    });
  });

  it("concentrates internet cases in the approved company list with internships as the majority", () => {
    const internetCases = cases.filter((item) => item.group === "internet");
    const approvedCompanies = new Set(["美团", "京东", "得物", "网易", "字节跳动", "滴滴", "快手", "阿里巴巴"]);
    const companyCounts = internetCases.reduce((counts, item) => ({ ...counts, [item.company]: (counts[item.company] ?? 0) + 1 }), {});

    expect(internetCases).toHaveLength(32);
    expect(internetCases.every((item) => approvedCompanies.has(item.company))).toBe(true);
    expect(internetCases.filter((item) => item.role.endsWith("实习"))).toHaveLength(26);
    expect(companyCounts).toEqual({ 美团: 5, 京东: 5, 得物: 4, 网易: 4, 字节跳动: 4, 滴滴: 4, 快手: 3, 阿里巴巴: 3 });
  });
});
