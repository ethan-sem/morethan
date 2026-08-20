import { FACTS_WORKER_ERROR_CODES, FACTS_WORKER_ERROR_MESSAGES } from "./resumeFactsWorkerRuntime.js";

export const DEFAULT_FACTS_EXTRACTION_TIMEOUT_MS = 15_000;

/** @typedef {{ terminate: () => void, postMessage: (message: unknown) => void, onmessage: ((event: MessageEvent) => void) | null, onerror: ((event: ErrorEvent) => void) | null, onmessageerror: ((event: MessageEvent) => void) | null }} WorkerLike */
/** @typedef {Parameters<import("./resumeFactsExtractor.js").extractResumeFacts>[0]} ResumeExtractionInput */
/** @typedef {ResumeExtractionInput & { signal?: AbortSignal, timeoutMs?: number, createWorker?: () => WorkerLike }} FactsWorkerClientOptions */

export class FactsWorkerClientError extends Error {
  /** @param {string} code @param {unknown} [cause] */
  constructor(code, cause) {
    super(FACTS_WORKER_ERROR_MESSAGES[code] ?? FACTS_WORKER_ERROR_MESSAGES[FACTS_WORKER_ERROR_CODES.EXTRACTION_FAILED], { cause });
    this.name = "FactsWorkerClientError";
    this.code = code;
  }
}

/** @param {FactsWorkerClientOptions} options */
export async function extractResumeFactsInWorker(options) {
  const { signal, timeoutMs = DEFAULT_FACTS_EXTRACTION_TIMEOUT_MS, createWorker = createFactsWorker, ...input } = options;
  if (signal?.aborted) throw new FactsWorkerClientError(FACTS_WORKER_ERROR_CODES.ABORTED, signal.reason);
  if (createWorker === createFactsWorker && typeof Worker !== "function") {
    const { extractResumeFacts } = await import("./resumeFactsExtractor.js");
    if (signal?.aborted) throw new FactsWorkerClientError(FACTS_WORKER_ERROR_CODES.ABORTED, signal.reason);
    return extractResumeFacts(input);
  }

  return new Promise((resolve, reject) => {
    /** @type {WorkerLike} */
    let worker;
    try {
      worker = createWorker();
    } catch (error) {
      reject(new FactsWorkerClientError(FACTS_WORKER_ERROR_CODES.UNAVAILABLE, error));
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
    const fail = (code, cause) => finish(() => reject(new FactsWorkerClientError(code, cause)));
    const abort = () => fail(FACTS_WORKER_ERROR_CODES.ABORTED, signal?.reason);
    const timeout = window.setTimeout(() => fail(FACTS_WORKER_ERROR_CODES.TIMEOUT), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });

    worker.onmessage = (event) => {
      const message = event.data;
      if (message?.type === "result" && message.result && typeof message.result === "object") finish(() => resolve(message.result));
      else if (message?.type === "error" && typeof message.code === "string") fail(message.code);
      else fail(FACTS_WORKER_ERROR_CODES.PROTOCOL_INVALID);
    };
    worker.onerror = (event) => fail(FACTS_WORKER_ERROR_CODES.CRASHED, event);
    worker.onmessageerror = (event) => fail(FACTS_WORKER_ERROR_CODES.PROTOCOL_INVALID, event);
    try {
      worker.postMessage({ type: "extract", input });
    } catch (error) {
      fail(FACTS_WORKER_ERROR_CODES.PROTOCOL_INVALID, error);
    }
  });
}

/** @returns {WorkerLike} */
function createFactsWorker() {
  if (typeof Worker !== "function") throw new Error("WORKER_API_UNAVAILABLE");
  return new Worker(new URL("./resumeFactsExtractor.worker.js", import.meta.url), { type: "module", name: "morethan-resume-facts" });
}
