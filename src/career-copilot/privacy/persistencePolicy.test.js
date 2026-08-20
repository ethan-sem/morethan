import { describe, expect, it } from "vitest";
import { CAREER_FLOW_STORAGE_KEY, CAREER_PERSISTENCE_ALLOWLIST, auditCareerPersistence, validateCareerPersistenceEntry } from "./persistencePolicy.js";

function memoryStorage(entries = []) {
  const data = new Map(entries);
  return {
    get length() { return data.size; },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

describe("career persistence policy", () => {
  it("allows only sanitized flow navigation in sessionStorage", () => {
    const safe = JSON.stringify({ version: 1, step: "facts", visited: ["intro", "material", "facts"] });
    expect(CAREER_PERSISTENCE_ALLOWLIST.localStorage).toEqual([]);
    expect(validateCareerPersistenceEntry("sessionStorage", CAREER_FLOW_STORAGE_KEY, safe)).toEqual({ valid: true, code: null });
    expect(validateCareerPersistenceEntry("localStorage", CAREER_FLOW_STORAGE_KEY, safe).valid).toBe(false);
    expect(validateCareerPersistenceEntry("sessionStorage", "morethan-career-copilot-report", safe).valid).toBe(false);
  });

  it("rejects extra flow fields that could retain sensitive application state", () => {
    const value = JSON.stringify({ version: 1, step: "facts", visited: ["intro", "facts"], resumeText: "private resume" });
    expect(validateCareerPersistenceEntry("sessionStorage", CAREER_FLOW_STORAGE_KEY, value)).toEqual({ valid: false, code: "FLOW_FIELD_FORBIDDEN" });
  });

  it("passes an audit with only the allowed flow state", async () => {
    const flow = JSON.stringify({ version: 1, step: "report", visited: ["intro", "report"] });
    const result = await auditCareerPersistence({
      sessionStorage: memoryStorage([[CAREER_FLOW_STORAGE_KEY, flow]]),
      localStorage: memoryStorage([["site-theme", "dark"]]),
      url: "https://morethan.example/career-copilot",
      sensitiveValues: ["13800138000", "private@example.com"],
    });
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("detects sensitive content across storage and URL without returning the content", async () => {
    const sensitive = "private@example.com";
    const result = await auditCareerPersistence({
      sessionStorage: memoryStorage([[CAREER_FLOW_STORAGE_KEY, JSON.stringify({ version: 1, step: "facts", visited: ["intro", "facts"] })]]),
      localStorage: memoryStorage([["morethan-career-copilot-report", `report for ${sensitive}`]]),
      url: `https://morethan.example/career-copilot?email=${encodeURIComponent(sensitive)}`,
      sensitiveValues: [sensitive],
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toEqual(expect.arrayContaining([
      { surface: "localStorage", key: "morethan-career-copilot-report", code: "SENSITIVE_VALUE_FOUND" },
      { surface: "localStorage", key: "morethan-career-copilot-report", code: "KEY_FORBIDDEN" },
      { surface: "url", key: "location", code: "SENSITIVE_VALUE_FOUND" },
    ]));
    expect(JSON.stringify(result)).not.toContain(sensitive);
  });
});
