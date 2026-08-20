import { extractPdfText } from "./pdfParser.js";
import { executeResumeParseRequest, RESUME_WORKER_CHANNEL, sanitizeWorkerErrorCode } from "./resumeParserWorkerRuntime.js";

self.onmessage = async (event) => {
  const request = event.data;
  try {
    const result = await executeResumeParseRequest(request, "pdf", extractPdfText, (progress) => {
      self.postMessage({ channel: RESUME_WORKER_CHANNEL, type: "progress", progress });
    });
    self.postMessage({ channel: RESUME_WORKER_CHANNEL, type: "result", result });
  } catch (error) {
    self.postMessage({ channel: RESUME_WORKER_CHANNEL, type: "error", code: sanitizeWorkerErrorCode(error, "pdf") });
  }
};
