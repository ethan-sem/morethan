import { describe, expect, it, vi } from "vitest";
import { executeFactsExtractionRequest, FACTS_WORKER_ERROR_CODES, sanitizeFactsWorkerErrorCode } from "./resumeFactsWorkerRuntime.js";

describe("facts worker runtime", () => {
  it("executes a valid extraction request", () => {
    const extractor = vi.fn(() => ({ schemaVersion: "1.0.0" }));
    const input = { text: "技能\nSQL", documentId: "doc", format: "paste" };
    expect(executeFactsExtractionRequest({ type: "extract", input }, extractor)).toEqual({ schemaVersion: "1.0.0" });
    expect(extractor).toHaveBeenCalledWith(input);
  });

  it("rejects malformed protocols and sanitizes private failures", () => {
    expect(() => executeFactsExtractionRequest({ type: "parse" })).toThrow(expect.objectContaining({ code: FACTS_WORKER_ERROR_CODES.PROTOCOL_INVALID }));
    expect(() => executeFactsExtractionRequest({ type: "extract", input: {} }, () => { throw new Error("private text"); }))
      .toThrow(expect.objectContaining({ code: FACTS_WORKER_ERROR_CODES.EXTRACTION_FAILED }));
    expect(sanitizeFactsWorkerErrorCode(new Error("raw"))).toBe(FACTS_WORKER_ERROR_CODES.EXTRACTION_FAILED);
  });
});
