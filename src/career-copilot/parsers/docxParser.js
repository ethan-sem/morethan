import { loadDocxDependency } from "./dependencyProbe.js";

export const DOCX_PARSE_ERROR_CODES = Object.freeze({
  ABORTED: "DOCX_ABORTED",
  EMPTY_FILE: "DOCX_EMPTY_FILE",
  INVALID: "DOCX_INVALID",
  NO_TEXT: "DOCX_NO_TEXT",
  PASSWORD_REQUIRED: "DOCX_PASSWORD_REQUIRED",
  PARSE_FAILED: "DOCX_PARSE_FAILED",
  UNSUPPORTED_INPUT: "DOCX_UNSUPPORTED_INPUT",
});

export const DOCX_PARSE_ERROR_MESSAGES = Object.freeze(/** @type {Record<string, string>} */ ({
  [DOCX_PARSE_ERROR_CODES.ABORTED]: "已停止解析这份 DOCX。",
  [DOCX_PARSE_ERROR_CODES.EMPTY_FILE]: "这份 DOCX 没有可读取的数据，请重新导出后再试。",
  [DOCX_PARSE_ERROR_CODES.INVALID]: "无法识别这份 DOCX，文件可能已经损坏或并非标准 Word 文档。",
  [DOCX_PARSE_ERROR_CODES.NO_TEXT]: "这份 DOCX 没有检测到足够的正文，请检查内容后重新选择。",
  [DOCX_PARSE_ERROR_CODES.PASSWORD_REQUIRED]: "这份 DOCX 受密码保护，请先解除密码后重新选择。",
  [DOCX_PARSE_ERROR_CODES.PARSE_FAILED]: "DOCX 解析没有完成，请重新导出为标准 DOCX 或改用 PDF。",
  [DOCX_PARSE_ERROR_CODES.UNSUPPORTED_INPUT]: "当前解析器没有收到有效的 DOCX 二进制数据。",
}));

const DEFAULT_MIN_TEXT_CHARACTERS = 24;

/** @typedef {{ code: string, level: "warning" | "error" }} DocxParseWarning */
/** @typedef {{ text: string, characterCount: number, paragraphCount: number, warnings: DocxParseWarning[] }} DocxParseResult */
/** @typedef {{ signal?: AbortSignal, minTextCharacters?: number, loadDependency?: typeof loadDocxDependency }} DocxParserOptions */

export class DocxParseError extends Error {
  /** @param {string} code @param {unknown} [cause] */
  constructor(code, cause) {
    super(DOCX_PARSE_ERROR_MESSAGES[code] ?? DOCX_PARSE_ERROR_MESSAGES[DOCX_PARSE_ERROR_CODES.PARSE_FAILED], { cause });
    this.name = "DocxParseError";
    this.code = code;
  }
}

/**
 * Extracts raw text from a local DOCX ArrayBuffer. No HTML is created or rendered.
 * @param {Blob | ArrayBuffer | Uint8Array} input
 * @param {DocxParserOptions} [options]
 * @returns {Promise<DocxParseResult>}
 */
export async function extractDocxText(input, options = {}) {
  const {
    signal,
    minTextCharacters = DEFAULT_MIN_TEXT_CHARACTERS,
    loadDependency = loadDocxDependency,
  } = options;

  try {
    throwIfAborted(signal);
    const data = await toOwnedUint8Array(input);
    if (data.byteLength === 0) throw new DocxParseError(DOCX_PARSE_ERROR_CODES.EMPTY_FILE);

    const mammoth = await loadDependency();
    throwIfAborted(signal);

    const result = await mammoth.extractRawText({ arrayBuffer: data.buffer });
    throwIfAborted(signal);

    const text = normalizeDocxText(result.value);
    const characterCount = countCharacters(text);
    if (characterCount < minTextCharacters) throw new DocxParseError(DOCX_PARSE_ERROR_CODES.NO_TEXT);

    const warnings = Array.isArray(result.messages)
      ? result.messages.map((message) => ({
        code: message?.type === "error" ? "DOCX_PARSER_ERROR" : "DOCX_PARSER_WARNING",
        level: message?.type === "error" ? /** @type {const} */ ("error") : /** @type {const} */ ("warning"),
      }))
      : [];

    return {
      text,
      characterCount,
      paragraphCount: text ? text.split(/\n{2,}/u).filter(Boolean).length : 0,
      warnings,
    };
  } catch (error) {
    if (error instanceof DocxParseError) throw error;
    throw mapDocxError(error);
  }
}

/** @param {string} value */
export function normalizeDocxText(value) {
  return String(value ?? "")
    .replace(/\r\n?/gu, "\n")
    .replace(/\u00a0/gu, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/gu, ""))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
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
  throw new DocxParseError(DOCX_PARSE_ERROR_CODES.UNSUPPORTED_INPUT);
}

/** @param {AbortSignal | undefined} signal */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new DocxParseError(DOCX_PARSE_ERROR_CODES.ABORTED, signal.reason);
}

/** @param {unknown} error */
function mapDocxError(error) {
  const message = error instanceof Error ? error.message : "";
  if (/encrypt|password|password protected/iu.test(message)) {
    return new DocxParseError(DOCX_PARSE_ERROR_CODES.PASSWORD_REQUIRED, error);
  }
  if (/zip|central directory|word\/document\.xml|could not find file/iu.test(message)) {
    return new DocxParseError(DOCX_PARSE_ERROR_CODES.INVALID, error);
  }
  return new DocxParseError(DOCX_PARSE_ERROR_CODES.PARSE_FAILED, error);
}
