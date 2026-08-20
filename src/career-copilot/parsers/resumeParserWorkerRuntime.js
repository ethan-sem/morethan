export const RESUME_WORKER_ERROR_CODES = Object.freeze({
  ABORTED: "WORKER_ABORTED",
  CRASHED: "WORKER_CRASHED",
  FORMAT_UNSUPPORTED: "WORKER_FORMAT_UNSUPPORTED",
  PARSE_FAILED: "WORKER_PARSE_FAILED",
  PROTOCOL_INVALID: "WORKER_PROTOCOL_INVALID",
  RESPONSE_INVALID: "WORKER_RESPONSE_INVALID",
  TIMEOUT: "WORKER_TIMEOUT",
  TRANSFER_FAILED: "WORKER_TRANSFER_FAILED",
  UNAVAILABLE: "WORKER_UNAVAILABLE",
});

export const RESUME_WORKER_CHANNEL = "morethan-resume-parser-v1";

export const RESUME_WORKER_ERROR_MESSAGES = Object.freeze(/** @type {Record<string, string>} */ ({
  [RESUME_WORKER_ERROR_CODES.ABORTED]: "已停止本地解析。",
  [RESUME_WORKER_ERROR_CODES.CRASHED]: "独立解析线程意外停止，请重新选择文件。",
  [RESUME_WORKER_ERROR_CODES.FORMAT_UNSUPPORTED]: "独立解析线程不支持当前文件格式。",
  [RESUME_WORKER_ERROR_CODES.PARSE_FAILED]: "独立解析线程没有完成处理，请重新导出文件后再试。",
  [RESUME_WORKER_ERROR_CODES.PROTOCOL_INVALID]: "本地解析任务格式无效，请刷新页面后重试。",
  [RESUME_WORKER_ERROR_CODES.RESPONSE_INVALID]: "本地解析线程返回了无法识别的结果，请刷新页面后重试。",
  [RESUME_WORKER_ERROR_CODES.TIMEOUT]: "本地解析等待时间过长，已自动停止。",
  [RESUME_WORKER_ERROR_CODES.TRANSFER_FAILED]: "浏览器无法把文件交给本地解析线程，请刷新页面后重试。",
  [RESUME_WORKER_ERROR_CODES.UNAVAILABLE]: "当前浏览器无法启动独立解析线程。",
}));

/** @typedef {"pdf" | "docx" | "txt"} WorkerResumeFormat */
/** @typedef {{ channel: string, type: "parse", format: WorkerResumeFormat, data: ArrayBuffer | Uint8Array }} ResumeWorkerRequest */

export class ResumeWorkerRuntimeError extends Error {
  /** @param {string} code @param {unknown} [cause] */
  constructor(code, cause) {
    super(RESUME_WORKER_ERROR_MESSAGES[code] ?? RESUME_WORKER_ERROR_MESSAGES[RESUME_WORKER_ERROR_CODES.PARSE_FAILED], { cause });
    this.name = "ResumeWorkerRuntimeError";
    this.code = code;
  }
}

/**
 * Executes one isolated parser request. The worker process is terminated by the client for cancellation.
 * @template T
 * @param {ResumeWorkerRequest} request
 * @param {WorkerResumeFormat} expectedFormat
 * @param {(data: Uint8Array, options: { onProgress?: (progress: { page: number, totalPages: number, percent: number }) => void }) => Promise<T>} parser
 * @param {(progress: { page: number, totalPages: number, percent: number }) => void} [onProgress]
 */
export async function executeResumeParseRequest(request, expectedFormat, parser, onProgress) {
  if (!request || request.channel !== RESUME_WORKER_CHANNEL || request.type !== "parse" || !isBinaryPayload(request.data)) {
    throw new ResumeWorkerRuntimeError(RESUME_WORKER_ERROR_CODES.PROTOCOL_INVALID);
  }
  if (request.format !== expectedFormat) throw new ResumeWorkerRuntimeError(RESUME_WORKER_ERROR_CODES.FORMAT_UNSUPPORTED);
  const data = ArrayBuffer.isView(request.data)
    ? new Uint8Array(request.data.buffer, request.data.byteOffset, request.data.byteLength)
    : new Uint8Array(request.data);
  return parser(data, { onProgress });
}

/** Cross-realm safe binary check for values received through structured clone. @param {unknown} value */
function isBinaryPayload(value) {
  if (ArrayBuffer.isView(value)) return true;
  if (!value || typeof value !== "object") return false;
  const tag = Object.prototype.toString.call(value);
  const byteLength = Reflect.get(value, "byteLength");
  return (tag === "[object ArrayBuffer]" || Reflect.get(value, "constructor")?.name === "ArrayBuffer") && Number.isInteger(byteLength);
}

/** @param {unknown} error @param {WorkerResumeFormat | string} format */
export function sanitizeWorkerErrorCode(error, format) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (/^(PDF|DOCX|TXT|WORKER)_[A-Z0-9_]+$/u.test(code)) return code;
  if (format === "pdf") return "PDF_PARSE_FAILED";
  if (format === "docx") return "DOCX_PARSE_FAILED";
  if (format === "txt") return "TXT_UNSUPPORTED_INPUT";
  return RESUME_WORKER_ERROR_CODES.PARSE_FAILED;
}
