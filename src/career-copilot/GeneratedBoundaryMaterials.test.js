import { describe, expect, it, vi } from "vitest";
import { createGeneratedCorruptDocx, createGeneratedEncryptedDocxContainer, createGeneratedPdf, createVirtualFile } from "../../scripts/testing/generated-career-binaries.js";
import { DOCX_PARSE_ERROR_CODES, extractDocxText } from "./parsers/docxParser.js";
import { extractPdfText, PDF_PARSE_ERROR_CODES } from "./parsers/pdfParser.js";
import { FILE_VALIDATION_ERROR_CODES, validateResumeFile } from "./parsers/resumeFileValidation.js";

describe("programmatically generated boundary materials", () => {
  it("validates and parses a generated text PDF with the installed runtime", async () => {
    const bytes = createGeneratedPdf("Synthetic Career Resume Product Internship 2026");
    const validated = await validateResumeFile(createVirtualFile("synthetic.pdf", bytes));
    const result = await extractPdfText(validated.data, { minTextCharacters: 10, loadDependency: () => import("pdfjs-dist/legacy/build/pdf.mjs") });
    expect(result).toMatchObject({ pageCount: 1, textPageCount: 1 });
    expect(result.text).toContain("Synthetic Career Resume");
  }, 20_000);

  it("treats a generated no-text PDF as scan-like and requests a text alternative", async () => {
    const bytes = createGeneratedPdf();
    const validated = await validateResumeFile(createVirtualFile("scan-like.pdf", bytes));
    await expect(extractPdfText(validated.data, { loadDependency: () => import("pdfjs-dist/legacy/build/pdf.mjs") }))
      .rejects.toMatchObject({ code: PDF_PARSE_ERROR_CODES.NO_TEXT_LAYER });
  }, 20_000);

  it("detects a generated protected DOCX container before loading Mammoth", async () => {
    const file = createVirtualFile("protected.docx", createGeneratedEncryptedDocxContainer());
    await expect(validateResumeFile(file)).rejects.toMatchObject({ code: FILE_VALIDATION_ERROR_CODES.ENCRYPTED_DOCX });
  });

  it("maps a generated corrupt DOCX to a fixed error without leaking parser details", async () => {
    const bytes = createGeneratedCorruptDocx();
    const validated = await validateResumeFile(createVirtualFile("corrupt.docx", bytes));
    const extractRawText = vi.fn(async () => { throw new Error("corrupt zip at synthetic private file path"); });
    let caught;
    try { await extractDocxText(validated.data, { loadDependency: async () => ({ extractRawText }) }); }
    catch (error) { caught = error; }
    expect(caught).toMatchObject({ code: DOCX_PARSE_ERROR_CODES.INVALID });
    expect(caught.message).not.toContain("synthetic private file path");
  });

  it("rejects a virtual oversized file before reading its payload", async () => {
    const file = createVirtualFile("oversized.pdf", createGeneratedPdf("fixture"), 10 * 1024 * 1024 + 1);
    file.arrayBuffer = vi.fn(file.arrayBuffer);
    await expect(validateResumeFile(file)).rejects.toMatchObject({ code: FILE_VALIDATION_ERROR_CODES.TOO_LARGE });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });
});
