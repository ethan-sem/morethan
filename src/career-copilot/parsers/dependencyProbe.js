/**
 * Lazy dependency boundary for the M2 browser parser work.
 * Keeping these imports dynamic prevents parser libraries from entering the homepage's initial bundle.
 */
export async function loadPdfDependency() {
  const [pdfjs, workerModule] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);

  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  if (typeof pdfjs.getDocument !== "function") throw new Error("PDFJS_API_UNAVAILABLE");
  return pdfjs;
}

export async function loadDocxDependency() {
  const module = await import("mammoth");
  const mammoth = module.default ?? module;
  if (typeof mammoth.extractRawText !== "function") throw new Error("MAMMOTH_API_UNAVAILABLE");
  return mammoth;
}

export async function verifyParserDependencies() {
  const [pdfjs, mammoth] = await Promise.all([loadPdfDependency(), loadDocxDependency()]);
  return {
    pdf: { version: pdfjs.version, hasGetDocument: true, workerConfigured: Boolean(pdfjs.GlobalWorkerOptions.workerSrc) },
    docx: { hasExtractRawText: typeof mammoth.extractRawText === "function" },
  };
}
