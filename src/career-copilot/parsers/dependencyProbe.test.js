import { describe, expect, it } from "vitest";
import { loadDocxDependency, loadPdfDependency, verifyParserDependencies } from "./dependencyProbe.js";

describe("parser dependency boundary", () => {
  it("exports lazy PDF and DOCX loaders", () => {
    expect(loadPdfDependency).toBeTypeOf("function");
    expect(loadDocxDependency).toBeTypeOf("function");
    expect(verifyParserDependencies).toBeTypeOf("function");
  });

  it("resolves the browser APIs through Vite", async () => {
    const result = await verifyParserDependencies();
    expect(result.pdf).toMatchObject({ hasGetDocument: true, workerConfigured: true });
    expect(result.docx).toEqual({ hasExtractRawText: true });
  }, 15000);
});
