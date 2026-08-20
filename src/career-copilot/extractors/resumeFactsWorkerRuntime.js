export const FACTS_WORKER_ERROR_CODES = Object.freeze({
  ABORTED: "FACTS_WORKER_ABORTED",
  CRASHED: "FACTS_WORKER_CRASHED",
  EXTRACTION_FAILED: "FACTS_WORKER_EXTRACTION_FAILED",
  PROTOCOL_INVALID: "FACTS_WORKER_PROTOCOL_INVALID",
  TIMEOUT: "FACTS_WORKER_TIMEOUT",
  UNAVAILABLE: "FACTS_WORKER_UNAVAILABLE",
});

export const FACTS_WORKER_ERROR_MESSAGES = Object.freeze(/** @type {Record<string, string>} */ ({
  [FACTS_WORKER_ERROR_CODES.ABORTED]: "已停止本地事实提取。",
  [FACTS_WORKER_ERROR_CODES.CRASHED]: "本地事实提取线程意外停止，请重新提交材料。",
  [FACTS_WORKER_ERROR_CODES.EXTRACTION_FAILED]: "当前材料未能完成事实提取，请检查文本结构后重试。",
  [FACTS_WORKER_ERROR_CODES.PROTOCOL_INVALID]: "本地事实提取任务格式无效，请刷新页面后重试。",
  [FACTS_WORKER_ERROR_CODES.TIMEOUT]: "本地事实提取等待时间过长，已自动停止。",
  [FACTS_WORKER_ERROR_CODES.UNAVAILABLE]: "当前浏览器无法启动本地事实提取线程。",
}));

export class FactsWorkerRuntimeError extends Error {
  /** @param {string} code @param {unknown} [cause] */
  constructor(code, cause) {
    super(FACTS_WORKER_ERROR_MESSAGES[code] ?? FACTS_WORKER_ERROR_MESSAGES[FACTS_WORKER_ERROR_CODES.EXTRACTION_FAILED], { cause });
    this.name = "FactsWorkerRuntimeError";
    this.code = code;
  }
}

/** @template TInput, TResult @param {unknown} request @param {(input: TInput) => TResult} extractor */
export function executeFactsExtractionRequest(request, extractor) {
  if (!request || typeof request !== "object" || !("type" in request) || request.type !== "extract" || !("input" in request) || !request.input || typeof request.input !== "object") {
    throw new FactsWorkerRuntimeError(FACTS_WORKER_ERROR_CODES.PROTOCOL_INVALID);
  }
  try {
    return extractor(/** @type {TInput} */ (request.input));
  } catch (error) {
    if (error instanceof FactsWorkerRuntimeError) throw error;
    throw new FactsWorkerRuntimeError(FACTS_WORKER_ERROR_CODES.EXTRACTION_FAILED, error);
  }
}

/** @param {unknown} error */
export function sanitizeFactsWorkerErrorCode(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return /^FACTS_WORKER_[A-Z0-9_]+$/u.test(code) ? code : FACTS_WORKER_ERROR_CODES.EXTRACTION_FAILED;
}
