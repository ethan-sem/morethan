export const TXT_PARSE_ERROR_CODES = Object.freeze({
  ABORTED: "TXT_ABORTED",
  EMPTY: "TXT_EMPTY",
  ENCODING_UNSUPPORTED: "TXT_ENCODING_UNSUPPORTED",
  TOO_SHORT: "TXT_TOO_SHORT",
  UNSUPPORTED_INPUT: "TXT_UNSUPPORTED_INPUT",
});

export const TXT_PARSE_ERROR_MESSAGES = Object.freeze(/** @type {Record<string, string>} */ ({
  [TXT_PARSE_ERROR_CODES.ABORTED]: "已停止读取这份文本。",
  [TXT_PARSE_ERROR_CODES.EMPTY]: "没有检测到文本内容，请粘贴或填写简历信息。",
  [TXT_PARSE_ERROR_CODES.ENCODING_UNSUPPORTED]: "无法识别这份 TXT 的文字编码，请另存为 UTF-8 后重试。",
  [TXT_PARSE_ERROR_CODES.TOO_SHORT]: "内容太短，暂时无法形成有效诊断，请补充教育、经历、项目或技能信息。",
  [TXT_PARSE_ERROR_CODES.UNSUPPORTED_INPUT]: "当前文本解析器没有收到有效内容。",
}));

const DEFAULT_MIN_TEXT_CHARACTERS = 24;

/** @typedef {"txt" | "paste" | "manual"} TextSource */
/** @typedef {{ text: string, source: TextSource, encoding: string, characterCount: number, paragraphCount: number, warnings: { code: string, level: "warning" }[] }} PlainTextResult */
/** @typedef {{ signal?: AbortSignal, minTextCharacters?: number }} TxtParserOptions */

export class TxtParseError extends Error {
  /** @param {string} code @param {unknown} [cause] */
  constructor(code, cause) {
    super(TXT_PARSE_ERROR_MESSAGES[code] ?? TXT_PARSE_ERROR_MESSAGES[TXT_PARSE_ERROR_CODES.UNSUPPORTED_INPUT], { cause });
    this.name = "TxtParseError";
    this.code = code;
  }
}

/** @param {Blob | ArrayBuffer | Uint8Array} input @param {TxtParserOptions} [options] */
export async function extractTxtText(input, options = {}) {
  const { signal, minTextCharacters = DEFAULT_MIN_TEXT_CHARACTERS } = options;
  throwIfAborted(signal);
  const data = await toOwnedUint8Array(input);
  if (data.byteLength === 0) throw new TxtParseError(TXT_PARSE_ERROR_CODES.EMPTY);
  const decoded = decodeTextBytes(data);
  throwIfAborted(signal);
  return preparePlainText(decoded.text, {
    source: "txt",
    encoding: decoded.encoding,
    minTextCharacters,
    warnings: decoded.warning ? [{ code: decoded.warning, level: "warning" }] : [],
  });
}

/**
 * Normalizes pasted or manually assembled text through the same boundary as TXT files.
 * @param {string} value
 * @param {{ source: TextSource, encoding?: string, minTextCharacters?: number, warnings?: { code: string, level: "warning" }[] }} options
 * @returns {PlainTextResult}
 */
export function preparePlainText(value, options) {
  if (typeof value !== "string") throw new TxtParseError(TXT_PARSE_ERROR_CODES.UNSUPPORTED_INPUT);
  const text = normalizePlainText(value);
  if (!text) throw new TxtParseError(TXT_PARSE_ERROR_CODES.EMPTY);
  const characterCount = countCharacters(text);
  if (characterCount < (options.minTextCharacters ?? DEFAULT_MIN_TEXT_CHARACTERS)) {
    throw new TxtParseError(TXT_PARSE_ERROR_CODES.TOO_SHORT);
  }
  return {
    text,
    source: options.source,
    encoding: options.encoding ?? "unicode",
    characterCount,
    paragraphCount: text.split(/\n{2,}/u).filter(Boolean).length,
    warnings: options.warnings ?? [],
  };
}

/** @param {string} value */
export function normalizePlainText(value) {
  return String(value ?? "")
    .replace(/^\ufeff/u, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/\u00a0/gu, " ")
    // Resume text may contain invisible binary control bytes after copy/export.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/gu, ""))
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

/** @param {Uint8Array} data */
export function decodeTextBytes(data) {
  try {
    if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
      return { text: new TextDecoder("utf-8").decode(data.subarray(3)), encoding: "utf-8-bom", warning: null };
    }
    if (data[0] === 0xff && data[1] === 0xfe) {
      return { text: new TextDecoder("utf-16le").decode(data.subarray(2)), encoding: "utf-16le", warning: null };
    }
    if (data[0] === 0xfe && data[1] === 0xff) {
      return { text: new TextDecoder("utf-16be").decode(data.subarray(2)), encoding: "utf-16be", warning: null };
    }

    try {
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(data), encoding: "utf-8", warning: null };
    } catch {
      return { text: new TextDecoder("gb18030", { fatal: true }).decode(data), encoding: "gb18030", warning: "TXT_LEGACY_ENCODING" };
    }
  } catch (error) {
    throw new TxtParseError(TXT_PARSE_ERROR_CODES.ENCODING_UNSUPPORTED, error);
  }
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
  throw new TxtParseError(TXT_PARSE_ERROR_CODES.UNSUPPORTED_INPUT);
}

/** @param {AbortSignal | undefined} signal */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new TxtParseError(TXT_PARSE_ERROR_CODES.ABORTED, signal.reason);
}
