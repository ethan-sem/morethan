export const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024;

export const FILE_VALIDATION_ERROR_CODES = Object.freeze({
  ABORTED: "FILE_ABORTED",
  EMPTY: "FILE_EMPTY",
  ENCRYPTED_DOCX: "FILE_ENCRYPTED_DOCX",
  INVALID_INPUT: "FILE_INVALID_INPUT",
  READ_FAILED: "FILE_READ_FAILED",
  TOO_LARGE: "FILE_TOO_LARGE",
  TYPE_MISMATCH: "FILE_TYPE_MISMATCH",
  TYPE_UNSUPPORTED: "FILE_TYPE_UNSUPPORTED",
});

export const FILE_VALIDATION_ERROR_MESSAGES = Object.freeze(/** @type {Record<string, string>} */ ({
  [FILE_VALIDATION_ERROR_CODES.ABORTED]: "已停止检查这份文件。",
  [FILE_VALIDATION_ERROR_CODES.EMPTY]: "这个文件是空的，没有可读取的数据。",
  [FILE_VALIDATION_ERROR_CODES.ENCRYPTED_DOCX]: "这份 DOCX 似乎受密码保护，当前版本无法在浏览器内读取。",
  [FILE_VALIDATION_ERROR_CODES.INVALID_INPUT]: "没有收到可读取的本地文件。",
  [FILE_VALIDATION_ERROR_CODES.READ_FAILED]: "浏览器没有成功读取这个文件，请重新选择或换用文字粘贴。",
  [FILE_VALIDATION_ERROR_CODES.TOO_LARGE]: "文件超过 10MB 的本地处理上限。",
  [FILE_VALIDATION_ERROR_CODES.TYPE_MISMATCH]: "文件内容与扩展名不一致，无法安全判断真实格式。",
  [FILE_VALIDATION_ERROR_CODES.TYPE_UNSUPPORTED]: "当前仅支持 PDF、DOCX 和 TXT 文件。",
}));

const ERROR_PRESENTATIONS = Object.freeze(/** @type {Record<string, { title: string, action: string }>} */ ({
  [FILE_VALIDATION_ERROR_CODES.ABORTED]: { title: "已停止读取", action: "如需继续，请重新选择文件。" },
  [FILE_VALIDATION_ERROR_CODES.EMPTY]: { title: "文件是空的", action: "请重新导出一份有内容的简历，或直接粘贴简历文字。" },
  [FILE_VALIDATION_ERROR_CODES.ENCRYPTED_DOCX]: { title: "DOCX 受密码保护", action: "请在 Word 中解除密码，并另存为标准 DOCX 后重试。" },
  [FILE_VALIDATION_ERROR_CODES.INVALID_INPUT]: { title: "没有读取到文件", action: "请重新选择 PDF、DOCX 或 TXT 文件。" },
  [FILE_VALIDATION_ERROR_CODES.READ_FAILED]: { title: "浏览器读取失败", action: "请重新选择文件；仍失败时可改用粘贴或手工填写。" },
  [FILE_VALIDATION_ERROR_CODES.TOO_LARGE]: { title: "文件超过 10MB", action: "请压缩或重新导出简历，确保文件不超过 10MB。" },
  [FILE_VALIDATION_ERROR_CODES.TYPE_MISMATCH]: { title: "文件格式不一致", action: "请用原应用重新导出，并保留正确的 .pdf、.docx 或 .txt 扩展名。" },
  [FILE_VALIDATION_ERROR_CODES.TYPE_UNSUPPORTED]: { title: "不支持这种文件", action: "请选择 PDF、DOCX、TXT，或直接粘贴简历文字。" },
  PDF_PASSWORD_REQUIRED: { title: "PDF 受密码保护", action: "请解除打开密码或重新导出为无密码 PDF。" },
  DOCX_PASSWORD_REQUIRED: { title: "DOCX 受密码保护", action: "请在 Word 中解除密码，并另存为标准 DOCX 后重试。" },
  PDF_INVALID: { title: "PDF 可能已损坏", action: "请重新导出为文本型 PDF，或改用 DOCX、TXT。" },
  DOCX_INVALID: { title: "DOCX 可能已损坏", action: "请在 Word 中重新打开并另存为标准 DOCX，或改用 PDF。" },
  PDF_NO_TEXT_LAYER: { title: "没有检测到可用文字", action: "扫描版 PDF 请改用文本型 PDF、DOCX，或直接粘贴正文。" },
  DOCX_NO_TEXT: { title: "DOCX 正文不足", action: "请检查文档正文，或直接粘贴完整简历。" },
  PDF_EMPTY_FILE: { title: "PDF 是空的", action: "请重新导出一份有内容的 PDF。" },
  DOCX_EMPTY_FILE: { title: "DOCX 是空的", action: "请重新导出一份有内容的 DOCX。" },
  TXT_EMPTY: { title: "文本是空的", action: "请补充教育、经历、项目或技能信息。" },
  TXT_TOO_SHORT: { title: "内容不足以诊断", action: "请补充教育、经历、项目或技能信息后重试。" },
  TXT_ENCODING_UNSUPPORTED: { title: "TXT 编码无法识别", action: "请将文件另存为 UTF-8，或直接粘贴简历文字。" },
  WORKER_ABORTED: { title: "已停止本地解析", action: "如需继续，请重新选择文件。" },
  WORKER_CRASHED: { title: "解析线程意外停止", action: "请重新选择文件；仍失败时可改用粘贴或手工填写。" },
  WORKER_FORMAT_UNSUPPORTED: { title: "解析线程不支持这种格式", action: "请选择 PDF、DOCX、TXT，或直接粘贴简历文字。" },
  WORKER_PARSE_FAILED: { title: "解析线程未完成", action: "请重新导出文件，或改用粘贴和手工填写。" },
  WORKER_PROTOCOL_INVALID: { title: "解析任务格式异常", action: "请刷新页面后重试。" },
  WORKER_TIMEOUT: { title: "本地解析超时", action: "请压缩或重新导出文件，或直接粘贴简历文字。" },
  WORKER_UNAVAILABLE: { title: "浏览器不支持独立解析", action: "请升级浏览器，或直接粘贴、手工填写简历。" },
}));

/** @typedef {"pdf" | "docx" | "txt"} ResumeFileFormat */
/** @typedef {{ signal?: AbortSignal, maxBytes?: number }} ResumeFileValidationOptions */
/** @typedef {{ format: ResumeFileFormat, data: Uint8Array, byteLength: number }} ValidatedResumeFile */

export class ResumeFileValidationError extends Error {
  /** @param {string} code @param {unknown} [cause] */
  constructor(code, cause) {
    super(FILE_VALIDATION_ERROR_MESSAGES[code] ?? FILE_VALIDATION_ERROR_MESSAGES[FILE_VALIDATION_ERROR_CODES.INVALID_INPUT], { cause });
    this.name = "ResumeFileValidationError";
    this.code = code;
  }
}

/** @param {string} name @returns {ResumeFileFormat | null} */
export function inferResumeFormatFromName(name) {
  const extension = String(name ?? "").toLowerCase().match(/\.([a-z0-9]+)$/u)?.[1];
  if (extension === "pdf" || extension === "docx" || extension === "txt") return extension;
  return null;
}

/**
 * Reads and validates a local resume before a format parser is loaded.
 * @param {File} file
 * @param {ResumeFileValidationOptions} [options]
 * @returns {Promise<ValidatedResumeFile>}
 */
export async function validateResumeFile(file, options = {}) {
  const { signal, maxBytes = MAX_RESUME_FILE_BYTES } = options;
  throwIfAborted(signal);
  if (!isReadableFile(file)) throw new ResumeFileValidationError(FILE_VALIDATION_ERROR_CODES.INVALID_INPUT);
  if (file.size === 0) throw new ResumeFileValidationError(FILE_VALIDATION_ERROR_CODES.EMPTY);
  if (file.size > maxBytes) throw new ResumeFileValidationError(FILE_VALIDATION_ERROR_CODES.TOO_LARGE);

  const format = inferResumeFormatFromName(file.name);
  if (!format) throw new ResumeFileValidationError(FILE_VALIDATION_ERROR_CODES.TYPE_UNSUPPORTED);

  let data;
  try {
    data = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    throw new ResumeFileValidationError(FILE_VALIDATION_ERROR_CODES.READ_FAILED, error);
  }
  throwIfAborted(signal);
  if (data.byteLength === 0) throw new ResumeFileValidationError(FILE_VALIDATION_ERROR_CODES.EMPTY);

  if (format === "pdf" && !hasPdfSignature(data)) throw new ResumeFileValidationError(FILE_VALIDATION_ERROR_CODES.TYPE_MISMATCH);
  if (format === "docx") {
    if (hasCompoundFileSignature(data)) {
      if (containsUtf16Le(data, "EncryptedPackage") || containsUtf16Le(data, "EncryptionInfo")) {
        throw new ResumeFileValidationError(FILE_VALIDATION_ERROR_CODES.ENCRYPTED_DOCX);
      }
      throw new ResumeFileValidationError(FILE_VALIDATION_ERROR_CODES.TYPE_MISMATCH);
    }
    if (!hasZipSignature(data)) throw new ResumeFileValidationError(FILE_VALIDATION_ERROR_CODES.TYPE_MISMATCH);
  }
  if (format === "txt" && (hasPdfSignature(data) || hasZipSignature(data) || hasCompoundFileSignature(data) || looksLikeBinary(data))) {
    throw new ResumeFileValidationError(FILE_VALIDATION_ERROR_CODES.TYPE_MISMATCH);
  }

  return { format, data, byteLength: data.byteLength };
}

/** @param {string} code @param {string} fallbackMessage */
export function getResumeErrorDetails(code, fallbackMessage) {
  const presentation = ERROR_PRESENTATIONS[code] ?? {
    title: "当前内容暂时无法使用",
    action: "请重新导出文件，或改用粘贴和手工填写。",
  };
  return { code, message: fallbackMessage, title: presentation.title, action: presentation.action };
}

/** @param {unknown} value @returns {value is File} */
function isReadableFile(value) {
  return Boolean(value && typeof value === "object" && "name" in value && "size" in value && "arrayBuffer" in value && typeof value.arrayBuffer === "function");
}

/** @param {Uint8Array} data */
function hasPdfSignature(data) {
  return data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46 && data[4] === 0x2d;
}

/** @param {Uint8Array} data */
function hasZipSignature(data) {
  return data[0] === 0x50 && data[1] === 0x4b && (
    (data[2] === 0x03 && data[3] === 0x04)
    || (data[2] === 0x05 && data[3] === 0x06)
    || (data[2] === 0x07 && data[3] === 0x08)
  );
}

/** @param {Uint8Array} data */
function hasCompoundFileSignature(data) {
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return signature.every((byte, index) => data[index] === byte);
}

/** @param {Uint8Array} data @param {string} text */
function containsUtf16Le(data, text) {
  const needle = new Uint8Array(text.length * 2);
  for (let index = 0; index < text.length; index += 1) {
    needle[index * 2] = text.charCodeAt(index) & 0xff;
    needle[index * 2 + 1] = text.charCodeAt(index) >>> 8;
  }
  outer: for (let offset = 0; offset <= data.byteLength - needle.byteLength; offset += 1) {
    for (let index = 0; index < needle.byteLength; index += 1) {
      if (data[offset + index] !== needle[index]) continue outer;
    }
    return true;
  }
  return false;
}

/** @param {Uint8Array} data */
function looksLikeBinary(data) {
  const isUtf16 = (data[0] === 0xff && data[1] === 0xfe) || (data[0] === 0xfe && data[1] === 0xff);
  if (isUtf16) return false;
  const sample = data.subarray(0, Math.min(data.byteLength, 1024));
  let controls = 0;
  for (const byte of sample) {
    if (byte === 0 || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)) controls += 1;
  }
  return controls / sample.byteLength > 0.02;
}

/** @param {AbortSignal | undefined} signal */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new ResumeFileValidationError(FILE_VALIDATION_ERROR_CODES.ABORTED, signal.reason);
}
