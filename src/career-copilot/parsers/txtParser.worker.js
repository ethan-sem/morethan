import { extractTxtText } from "./txtParser.js";
import { executeResumeParseRequest, RESUME_WORKER_CHANNEL, sanitizeWorkerErrorCode } from "./resumeParserWorkerRuntime.js";

self.onmessage = async (event) => {
  const request = event.data;
  try {
    const result = await executeResumeParseRequest(request, "txt", extractTxtText);
    self.postMessage({ channel: RESUME_WORKER_CHANNEL, type: "result", result });
  } catch (error) {
    self.postMessage({ channel: RESUME_WORKER_CHANNEL, type: "error", code: sanitizeWorkerErrorCode(error, "txt") });
  }
};
