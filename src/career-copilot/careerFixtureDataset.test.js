import { describe, expect, it } from "vitest";
import { validateCareerFixtureDataset } from "../../scripts/validate-career-fixtures.js";

describe("synthetic career fixture dataset", () => {
  it("covers the required anonymous resume and JD scenarios", () => {
    const result = validateCareerFixtureDataset();
    expect(result).toEqual({ valid: true, errors: [], summary: { entries: 16, resumes: 10, jds: 6, scenarios: 15 } });
  });
});
