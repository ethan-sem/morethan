import { afterEach, describe, expect, it, vi } from "vitest";
import { extractResumeFactsInWorker, FactsWorkerClientError } from "./resumeFactsWorkerClient.js";
import { FACTS_WORKER_ERROR_CODES } from "./resumeFactsWorkerRuntime.js";

function fakeWorker() {
  return { onmessage: null, onerror: null, onmessageerror: null, postMessage: vi.fn(), terminate: vi.fn() };
}

const input = { text: "技能\nSQL", documentId: "doc", format: "paste" };

afterEach(() => vi.useRealTimers());

describe("facts extractor worker client", () => {
  it("posts local text, resolves a result and terminates", async () => {
    const worker = fakeWorker();
    const pending = extractResumeFactsInWorker({ ...input, createWorker: () => worker });
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "extract", input });
    worker.onmessage({ data: { type: "result", result: { schemaVersion: "1.0.0" } } });
    await expect(pending).resolves.toEqual({ schemaVersion: "1.0.0" });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("supports cancellation and timeout", async () => {
    const cancelledWorker = fakeWorker();
    const controller = new AbortController();
    const cancelled = extractResumeFactsInWorker({ ...input, signal: controller.signal, createWorker: () => cancelledWorker });
    const rejection = expect(cancelled).rejects.toMatchObject({ code: FACTS_WORKER_ERROR_CODES.ABORTED });
    controller.abort("user");
    await rejection;
    expect(cancelledWorker.terminate).toHaveBeenCalledOnce();

    vi.useFakeTimers();
    const timedWorker = fakeWorker();
    const timed = extractResumeFactsInWorker({ ...input, timeoutMs: 50, createWorker: () => timedWorker });
    const timedRejection = expect(timed).rejects.toMatchObject({ code: FACTS_WORKER_ERROR_CODES.TIMEOUT });
    await vi.advanceTimersByTimeAsync(50);
    await timedRejection;
  });

  it("maps crashes, malformed messages and startup failures", async () => {
    const crashedWorker = fakeWorker();
    const crashed = extractResumeFactsInWorker({ ...input, createWorker: () => crashedWorker });
    crashedWorker.onerror(new ErrorEvent("error"));
    await expect(crashed).rejects.toMatchObject({ code: FACTS_WORKER_ERROR_CODES.CRASHED });

    const malformedWorker = fakeWorker();
    const malformed = extractResumeFactsInWorker({ ...input, createWorker: () => malformedWorker });
    malformedWorker.onmessage({ data: { unexpected: true } });
    await expect(malformed).rejects.toMatchObject({ code: FACTS_WORKER_ERROR_CODES.PROTOCOL_INVALID });

    await expect(extractResumeFactsInWorker({ ...input, createWorker: () => { throw new Error("private"); } })).rejects.toBeInstanceOf(FactsWorkerClientError);
  });
});
