import { RESUME_WORKER_CHANNEL, RESUME_WORKER_ERROR_CODES, RESUME_WORKER_ERROR_MESSAGES } from "./resumeParserWorkerRuntime.js";

export const DEFAULT_RESUME_PARSE_TIMEOUT_MS = 45_000;

/** @typedef {"pdf" | "docx" | "txt"} WorkerResumeFormat */
/** @typedef {{ terminate: () => void, postMessage: (message: unknown, transfer: Transferable[]) => void, onmessage: ((event: MessageEvent) => void) | null, onerror: ((event: ErrorEvent) => void) | null, onmessageerror: ((event: MessageEvent) => void) | null }} WorkerLike */
/** @typedef {{ format: WorkerResumeFormat, data: Uint8Array, signal?: AbortSignal, onProgress?: (progress: { page: number, totalPages: number, percent: number }) => void, timeoutMs?: number, createWorker?: (format: WorkerResumeFormat) => WorkerLike }} ResumeWorkerClientOptions */

export class ResumeWorkerClientError extends Error {
  /** @param {string} code @param {unknown} [cause] */
  constructor(code, cause) {
    super(RESUME_WORKER_ERROR_MESSAGES[code] ?? RESUME_WORKER_ERROR_MESSAGES[RESUME_WORKER_ERROR_CODES.PARSE_FAILED], { cause });
    this.name = "ResumeWorkerClientError";
    this.code = code;
  }
}

/** @param {ResumeWorkerClientOptions} options */
export function parseResumeInWorker(options) {
  const { format, data, signal, onProgress, timeoutMs = DEFAULT_RESUME_PARSE_TIMEOUT_MS, createWorker = createParserWorker } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ResumeWorkerClientError(RESUME_WORKER_ERROR_CODES.ABORTED, signal.reason));
      return;
    }

    /** @type {WorkerLike} */
    let worker;
    try {
      worker = createWorker(format);
    } catch (error) {
      reject(new ResumeWorkerClientError(RESUME_WORKER_ERROR_CODES.UNAVAILABLE, error));
      return;
    }

    let settled = false;
    /** @param {() => void} callback */
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      callback();
    };
    /** @param {string} code @param {unknown} [cause] */
    const fail = (code, cause) => finish(() => reject(new ResumeWorkerClientError(code, cause)));
    const abort = () => fail(RESUME_WORKER_ERROR_CODES.ABORTED, signal?.reason);
    const timeout = window.setTimeout(() => fail(RESUME_WORKER_ERROR_CODES.TIMEOUT), timeoutMs);

    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event) => {
      const message = event.data;
      if (message?.channel !== RESUME_WORKER_CHANNEL) return;
      if (message?.type === "progress" && isProgress(message.progress)) {
        onProgress?.(message.progress);
        return;
      }
      if (message?.type === "result" && message.result && typeof message.result === "object") {
        finish(() => resolve(message.result));
        return;
      }
      if (message?.type === "error" && typeof message.code === "string") {
        fail(message.code);
        return;
      }
      fail(RESUME_WORKER_ERROR_CODES.RESPONSE_INVALID);
    };
    worker.onerror = (event) => fail(RESUME_WORKER_ERROR_CODES.CRASHED, event);
    worker.onmessageerror = (event) => fail(RESUME_WORKER_ERROR_CODES.RESPONSE_INVALID, event);

    const owned = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength ? data : data.slice();
    try {
      worker.postMessage({ channel: RESUME_WORKER_CHANNEL, type: "parse", format, data: owned }, [owned.buffer]);
    } catch (error) {
      fail(RESUME_WORKER_ERROR_CODES.TRANSFER_FAILED, error);
    }
  });
}

/** @param {WorkerResumeFormat} format @returns {WorkerLike} */
function createParserWorker(format) {
  if (typeof Worker !== "function") throw new Error("WORKER_API_UNAVAILABLE");
  if (format === "pdf") return new Worker(new URL("./pdfParser.worker.js", import.meta.url), { type: "module", name: "morethan-pdf-parser" });
  if (format === "docx") return new Worker(new URL("./docxParser.worker.js", import.meta.url), { type: "module", name: "morethan-docx-parser" });
  if (format === "txt") return new Worker(new URL("./txtParser.worker.js", import.meta.url), { type: "module", name: "morethan-txt-parser" });
  throw new Error("WORKER_FORMAT_UNSUPPORTED");
}

/** @param {unknown} value @returns {value is { page: number, totalPages: number, percent: number }} */
function isProgress(value) {
  return Boolean(value && typeof value === "object" && "percent" in value && Number.isFinite(Number(value.percent)));
}
