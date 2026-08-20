import { afterEach, describe, expect, it, vi } from "vitest";
import { parseResumeInWorker, ResumeWorkerClientError } from "./resumeParserWorkerClient.js";
import { RESUME_WORKER_CHANNEL, RESUME_WORKER_ERROR_CODES } from "./resumeParserWorkerRuntime.js";

function fakeWorker() {
  return {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("resume parser worker client", () => {
  it("transfers bytes, reports progress and terminates after success", async () => {
    const worker = fakeWorker();
    const createWorker = vi.fn(() => worker);
    const onProgress = vi.fn();
    const pending = parseResumeInWorker({ format: "pdf", data: new Uint8Array([1, 2, 3]), createWorker, onProgress });

    expect(createWorker).toHaveBeenCalledWith("pdf");
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: RESUME_WORKER_CHANNEL, type: "parse", format: "pdf", data: expect.any(Uint8Array) }),
      [expect.any(ArrayBuffer)],
    );
    worker.onmessage({ data: { channel: "pdfjs-internal", type: "progress", progress: { percent: 1 } } });
    worker.onmessage({ data: { channel: RESUME_WORKER_CHANNEL, type: "progress", progress: { page: 1, totalPages: 2, percent: 50 } } });
    worker.onmessage({ data: { channel: RESUME_WORKER_CHANNEL, type: "result", result: { text: "resume" } } });

    await expect(pending).resolves.toEqual({ text: "resume" });
    expect(onProgress).toHaveBeenCalledWith({ page: 1, totalPages: 2, percent: 50 });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminates immediately when the user cancels", async () => {
    const worker = fakeWorker();
    const controller = new AbortController();
    const pending = parseResumeInWorker({ format: "docx", data: new Uint8Array([1]), signal: controller.signal, createWorker: () => worker });
    const rejected = expect(pending).rejects.toMatchObject({ code: RESUME_WORKER_ERROR_CODES.ABORTED });
    controller.abort("user");
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminates a task after the fixed timeout", async () => {
    vi.useFakeTimers();
    const worker = fakeWorker();
    const pending = parseResumeInWorker({ format: "txt", data: new Uint8Array([1]), timeoutMs: 100, createWorker: () => worker });
    const rejected = expect(pending).rejects.toMatchObject({ code: RESUME_WORKER_ERROR_CODES.TIMEOUT });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("maps worker crashes and malformed messages to stable errors", async () => {
    const crashedWorker = fakeWorker();
    const crashed = parseResumeInWorker({ format: "pdf", data: new Uint8Array([1]), createWorker: () => crashedWorker });
    crashedWorker.onerror(new ErrorEvent("error"));
    await expect(crashed).rejects.toMatchObject({ code: RESUME_WORKER_ERROR_CODES.CRASHED });

    const malformedWorker = fakeWorker();
    const malformed = parseResumeInWorker({ format: "pdf", data: new Uint8Array([1]), createWorker: () => malformedWorker });
    malformedWorker.onmessage({ data: { channel: RESUME_WORKER_CHANNEL, unexpected: true } });
    await expect(malformed).rejects.toMatchObject({ code: RESUME_WORKER_ERROR_CODES.RESPONSE_INVALID });
  });

  it("fails safely when Worker cannot start or transfer data", async () => {
    await expect(parseResumeInWorker({
      format: "pdf",
      data: new Uint8Array([1]),
      createWorker: () => { throw new Error("private browser detail"); },
    })).rejects.toBeInstanceOf(ResumeWorkerClientError);

    const worker = fakeWorker();
    worker.postMessage.mockImplementation(() => { throw new DOMException("clone failed"); });
    await expect(parseResumeInWorker({ format: "pdf", data: new Uint8Array([1]), createWorker: () => worker }))
      .rejects.toMatchObject({ code: RESUME_WORKER_ERROR_CODES.TRANSFER_FAILED });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("forwards sanitized parser error codes returned by the worker", async () => {
    const worker = fakeWorker();
    const pending = parseResumeInWorker({ format: "pdf", data: new Uint8Array([1]), createWorker: () => worker });
    worker.onmessage({ data: { channel: RESUME_WORKER_CHANNEL, type: "error", code: "PDF_PASSWORD_REQUIRED" } });
    await expect(pending).rejects.toMatchObject({ code: "PDF_PASSWORD_REQUIRED" });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
