import { loadPdfDependency } from "./dependencyProbe.js";

export const PDF_PARSE_ERROR_CODES = Object.freeze({
  ABORTED: "PDF_ABORTED",
  EMPTY_FILE: "PDF_EMPTY_FILE",
  INVALID: "PDF_INVALID",
  NO_TEXT_LAYER: "PDF_NO_TEXT_LAYER",
  PASSWORD_REQUIRED: "PDF_PASSWORD_REQUIRED",
  PARSE_FAILED: "PDF_PARSE_FAILED",
  UNSUPPORTED_INPUT: "PDF_UNSUPPORTED_INPUT",
});

export const PDF_PARSE_ERROR_MESSAGES = Object.freeze(/** @type {Record<string, string>} */ ({
  [PDF_PARSE_ERROR_CODES.ABORTED]: "已停止解析这份 PDF。",
  [PDF_PARSE_ERROR_CODES.EMPTY_FILE]: "这份 PDF 没有可读取的数据，请重新导出后再试。",
  [PDF_PARSE_ERROR_CODES.INVALID]: "无法识别这份 PDF，文件可能已经损坏。",
  [PDF_PARSE_ERROR_CODES.NO_TEXT_LAYER]: "没有检测到足够的文字。这可能是扫描版 PDF，当前版本暂不支持 OCR，请换用文本型 PDF。",
  [PDF_PARSE_ERROR_CODES.PASSWORD_REQUIRED]: "这份 PDF 受密码保护，请先解除密码后重新上传。",
  [PDF_PARSE_ERROR_CODES.PARSE_FAILED]: "PDF 解析没有完成，请重新导出为文本型 PDF 后再试。",
  [PDF_PARSE_ERROR_CODES.UNSUPPORTED_INPUT]: "当前解析器没有收到有效的 PDF 二进制数据。",
}));

const DEFAULT_MIN_TEXT_CHARACTERS = 24;

/** @typedef {{ page: number, totalPages: number, percent: number }} PdfParseProgress */
/** @typedef {{ code: string, page?: number }} PdfParseWarning */
/** @typedef {{ text: string, pageCount: number, textPageCount: number, characterCount: number, pages: { pageNumber: number, text: string }[], warnings: PdfParseWarning[] }} PdfParseResult */
/** @typedef {{ signal?: AbortSignal, onProgress?: (progress: PdfParseProgress) => void, minTextCharacters?: number, loadDependency?: typeof loadPdfDependency }} PdfParserOptions */

export class PdfParseError extends Error {
  /** @param {string} code @param {unknown} [cause] */
  constructor(code, cause) {
    super(PDF_PARSE_ERROR_MESSAGES[code] ?? PDF_PARSE_ERROR_MESSAGES[PDF_PARSE_ERROR_CODES.PARSE_FAILED], { cause });
    this.name = "PdfParseError";
    this.code = code;
  }
}

/**
 * Extracts text from a local PDF without accepting URLs or rendering PDF content.
 * @param {Blob | ArrayBuffer | Uint8Array} input
 * @param {PdfParserOptions} [options]
 * @returns {Promise<PdfParseResult>}
 */
export async function extractPdfText(input, options = {}) {
  const {
    signal,
    onProgress,
    minTextCharacters = DEFAULT_MIN_TEXT_CHARACTERS,
    loadDependency = loadPdfDependency,
  } = options;

  let loadingTask;
  let documentProxy;

  try {
    throwIfAborted(signal);
    const data = await toOwnedUint8Array(input);
    if (data.byteLength === 0) throw new PdfParseError(PDF_PARSE_ERROR_CODES.EMPTY_FILE);

    const pdfjs = await loadDependency();
    throwIfAborted(signal);

    const localOnlySource = {
      data,
      stopAtErrors: false,
      useWorkerFetch: false,
      useWasm: false,
      enableXfa: false,
      enableScripting: false,
    };

    loadingTask = pdfjs.getDocument(localOnlySource);
    documentProxy = await loadingTask.promise;

    const pages = [];
    const warnings = [];
    let textPageCount = 0;

    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      throwIfAborted(signal);
      const page = await documentProxy.getPage(pageNumber);
      try {
        const textContent = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
        const text = textItemsToText(textContent.items);
        if (countCharacters(text) > 0) textPageCount += 1;
        else warnings.push({ code: "PDF_PAGE_WITHOUT_TEXT", page: pageNumber });
        pages.push({ pageNumber, text });
      } finally {
        page.cleanup();
      }

      onProgress?.({
        page: pageNumber,
        totalPages: documentProxy.numPages,
        percent: Math.round((pageNumber / documentProxy.numPages) * 100),
      });
    }

    const text = pages.map(({ text: pageText }) => pageText).filter(Boolean).join("\n\n").trim();
    const characterCount = countCharacters(text);
    if (characterCount < minTextCharacters) throw new PdfParseError(PDF_PARSE_ERROR_CODES.NO_TEXT_LAYER);

    return {
      text,
      pageCount: documentProxy.numPages,
      textPageCount,
      characterCount,
      pages,
      warnings,
    };
  } catch (error) {
    if (error instanceof PdfParseError) throw error;
    throw mapPdfError(error);
  } finally {
    if (loadingTask) await loadingTask.destroy().catch(() => undefined);
  }
}

/** @param {unknown[]} items */
export function textItemsToText(items) {
  /** @type {string[]} */
  const lines = [];
  let line = "";
  let previousY;
  let previousEndX;
  let previousHeight = 0;

  const flush = () => {
    const normalized = line.replace(/\s+/gu, " ").trim();
    if (normalized) lines.push(normalized);
    line = "";
    previousEndX = undefined;
  };

  for (const item of items) {
    if (!isTextItem(item) || !item.str) continue;
    const x = Number(item.transform?.[4]);
    const y = Number(item.transform?.[5]);
    const height = Math.abs(Number(item.height)) || previousHeight || 10;

    if (typeof previousY === "number" && Number.isFinite(y) && Math.abs(y - previousY) > Math.max(2, height * 0.45)) flush();

    const gap = typeof previousEndX === "number" && Number.isFinite(x) ? x - previousEndX : 0;
    if (line && shouldInsertSpace(line, item.str, gap, height)) line += " ";
    line += item.str;

    previousY = y;
    previousHeight = height;
    if (Number.isFinite(x)) previousEndX = x + (Number(item.width) || 0);
    if (item.hasEOL) flush();
  }

  flush();
  return lines.join("\n");
}

/** @param {unknown} value @returns {value is { str: string, transform?: number[], height?: number, width?: number, hasEOL?: boolean }} */
function isTextItem(value) {
  return Boolean(value && typeof value === "object" && "str" in value);
}

/** @param {string} left @param {string} right @param {number} gap @param {number} height */
function shouldInsertSpace(left, right, gap, height) {
  if (/\s$/u.test(left) || /^\s/u.test(right)) return false;
  if (gap > Math.max(1.5, height * 0.16)) return true;
  return /[A-Za-z0-9]$/u.test(left) && /^[A-Za-z0-9]/u.test(right);
}

/** @param {string} text */
function countCharacters(text) {
  return text.replace(/\s/gu, "").length;
}

/** @param {Blob | ArrayBuffer | Uint8Array} input */
async function toOwnedUint8Array(input) {
  if (ArrayBuffer.isView(input)) {
    const owned = new Uint8Array(input.byteLength);
    owned.set(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
    return owned;
  }
  if (Object.prototype.toString.call(input) === "[object ArrayBuffer]") {
    return new Uint8Array(/** @type {ArrayBuffer} */ (input).slice(0));
  }
  if (input && typeof input === "object" && "arrayBuffer" in input && typeof input.arrayBuffer === "function") {
    return new Uint8Array(await input.arrayBuffer());
  }
  throw new PdfParseError(PDF_PARSE_ERROR_CODES.UNSUPPORTED_INPUT);
}

/** @param {AbortSignal | undefined} signal */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new PdfParseError(PDF_PARSE_ERROR_CODES.ABORTED, signal.reason);
}

/** @param {unknown} error */
function mapPdfError(error) {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "PasswordException") return new PdfParseError(PDF_PARSE_ERROR_CODES.PASSWORD_REQUIRED, error);
  if (name === "InvalidPDFException" || name === "MissingPDFException") return new PdfParseError(PDF_PARSE_ERROR_CODES.INVALID, error);
  if (name === "AbortException") return new PdfParseError(PDF_PARSE_ERROR_CODES.ABORTED, error);
  return new PdfParseError(PDF_PARSE_ERROR_CODES.PARSE_FAILED, error);
}
