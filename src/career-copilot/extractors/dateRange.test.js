import { describe, expect, it } from "vitest";
import { dateToOrdinal, extractDateRange, normalizeDateToken } from "./dateRange.js";

describe("resume date rules", () => {
  it.each([
    ["2023", { value: "2023", precision: "year" }],
    ["2023年9月", { value: "2023-09", precision: "month" }],
    ["2024/02/29", { value: "2024-02-29", precision: "day" }],
  ])("normalizes %s", (token, expected) => {
    expect(normalizeDateToken(token)).toEqual(expected);
  });

  it("extracts ranges with different separators and ongoing markers", () => {
    expect(extractDateRange("2023.09 - 2024/03").dateRange).toEqual({
      start: { value: "2023-09", precision: "month" },
      end: { value: "2024-03", precision: "month" },
      ongoing: false,
    });
    expect(extractDateRange("2024年6月—至今").dateRange).toEqual({
      start: { value: "2024-06", precision: "month" },
      end: null,
      ongoing: true,
    });
  });

  it("keeps year ranges as two years instead of interpreting the second year as a month", () => {
    expect(extractDateRange("2023-2027").dateRange).toEqual({
      start: { value: "2023", precision: "year" },
      end: { value: "2027", precision: "year" },
      ongoing: false,
    });
  });

  it("reports impossible dates without turning them into valid dates", () => {
    const result = extractDateRange("2023.13 - 2024.02.30");
    expect(result.dateRange).toBeNull();
    expect(result.invalidRanges).toHaveLength(2);
  });

  it("provides comparable start and end boundaries", () => {
    expect(dateToOrdinal({ value: "2024", precision: "year" }, "start"))
      .toBeLessThan(dateToOrdinal({ value: "2024", precision: "year" }, "end"));
  });
});
