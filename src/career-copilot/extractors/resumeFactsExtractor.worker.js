import { executeFactsExtractionRequest, sanitizeFactsWorkerErrorCode } from "./resumeFactsWorkerRuntime.js";
import { extractResumeFacts } from "./resumeFactsExtractor.js";

self.onmessage = (event) => {
  try {
    const result = executeFactsExtractionRequest(event.data, extractResumeFacts);
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({ type: "error", code: sanitizeFactsWorkerErrorCode(error) });
  }
};
