import { describe, expect, it, vi } from "vitest";
import { extractPdfText, PDF_PARSE_ERROR_CODES, PdfParseError, textItemsToText } from "./pdfParser.js";

function textItem(str, x, y, options = {}) {
  return { str, transform: [1, 0, 0, 1, x, y], width: options.width ?? str.length * 6, height: 12, hasEOL: options.hasEOL ?? false };
}

function createMockDependency(pageItems) {
  const pages = pageItems.map((items) => ({ getTextContent: vi.fn(async () => ({ items })), cleanup: vi.fn() }));
  const documentProxy = { numPages: pages.length, getPage: vi.fn(async (pageNumber) => pages[pageNumber - 1]) };
  const loadingTask = { promise: Promise.resolve(documentProxy), destroy: vi.fn(async () => undefined) };
  const getDocument = vi.fn(() => loadingTask);
  return { dependency: { getDocument }, getDocument, loadingTask, pages };
}

function buildTextPdf(text) {
  const encoder = new TextEncoder();
  const safeText = text.replace(/([\\()])/gu, "\\$1");
  const stream = `BT\n/F1 12 Tf\n72 720 Td\n(${safeText}) Tj\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${encoder.encode(stream).byteLength} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(source).byteLength);
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = encoder.encode(source).byteLength;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return encoder.encode(source);
}

describe("PDF text reconstruction", () => {
  it("preserves lines and inserts spaces for separated English words", () => {
    const text = textItemsToText([
      textItem("产品", 10, 100, { width: 22 }),
      textItem("经理", 33, 100, { width: 22, hasEOL: true }),
      textItem("Product", 10, 80, { width: 42 }),
      textItem("Intern", 60, 80, { width: 30 }),
    ]);
    expect(text).toBe("产品经理\nProduct Intern");
  });
});

describe("extractPdfText", () => {
  it("extracts pages locally, reports progress and destroys the loading task", async () => {
    const mock = createMockDependency([
      [textItem("MoreThan Career Resume", 10, 100, { hasEOL: true })],
      [textItem("Product Internship Experience", 10, 100, { hasEOL: true })],
    ]);
    const onProgress = vi.fn();
    const result = await extractPdfText(new Uint8Array([1, 2, 3]), {
      loadDependency: async () => mock.dependency,
      onProgress,
      minTextCharacters: 10,
    });

    expect(result).toMatchObject({ pageCount: 2, textPageCount: 2, warnings: [] });
    expect(result.text).toContain("MoreThan Career Resume");
    expect(onProgress).toHaveBeenLastCalledWith({ page: 2, totalPages: 2, percent: 100 });
    expect(mock.getDocument).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.any(Uint8Array),
      enableScripting: false,
      enableXfa: false,
      useWorkerFetch: false,
      useWasm: false,
    }));
    expect(mock.getDocument.mock.calls[0][0]).not.toHaveProperty("url");
    expect(mock.pages.every((page) => page.cleanup.mock.calls.length === 1)).toBe(true);
    expect(mock.loadingTask.destroy).toHaveBeenCalledOnce();
  });

  it("identifies PDFs without a usable text layer", async () => {
    const mock = createMockDependency([[], [textItem("1", 10, 100)]]);
    await expect(extractPdfText(new Uint8Array([1]), { loadDependency: async () => mock.dependency }))
      .rejects.toMatchObject({ code: PDF_PARSE_ERROR_CODES.NO_TEXT_LAYER });
    expect(mock.loadingTask.destroy).toHaveBeenCalledOnce();
  });

  it("maps password errors without leaking the underlying message", async () => {
    const sourceError = Object.assign(new Error("secret filename"), { name: "PasswordException" });
    const loadingTask = { promise: Promise.reject(sourceError), destroy: vi.fn(async () => undefined) };
    const dependency = { getDocument: vi.fn(() => loadingTask) };

    let caught;
    try {
      await extractPdfText(new Uint8Array([1]), { loadDependency: async () => dependency });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PdfParseError);
    expect(caught).toMatchObject({ code: PDF_PARSE_ERROR_CODES.PASSWORD_REQUIRED });
    expect(caught.message).not.toContain("secret filename");
  });

  it("parses a generated text PDF with the installed PDF.js runtime", async () => {
    const bytes = buildTextPdf("MoreThan Career Resume Product Internship 2026");
    const result = await extractPdfText(bytes, {
      minTextCharacters: 10,
      loadDependency: () => import("pdfjs-dist/legacy/build/pdf.mjs"),
    });
    expect(result.pageCount).toBe(1);
    expect(result.text).toContain("MoreThan Career Resume Product Internship 2026");
  }, 20_000);
});

