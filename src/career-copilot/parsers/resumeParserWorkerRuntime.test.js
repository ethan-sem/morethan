import { describe, expect, it, vi } from "vitest";
import {
  executeResumeParseRequest,
  RESUME_WORKER_CHANNEL,
  RESUME_WORKER_ERROR_CODES,
  sanitizeWorkerErrorCode,
} from "./resumeParserWorkerRuntime.js";

describe("resume parser worker runtime", () => {
  it("accepts an ArrayBuffer created in another browser realm", async () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const foreignBuffer = new frame.contentWindow.ArrayBuffer(4);
    const parser = vi.fn(async (data) => ({ byteLength: data.byteLength }));

    await expect(executeResumeParseRequest({ channel: RESUME_WORKER_CHANNEL, type: "parse", format: "pdf", data: foreignBuffer }, "pdf", parser)).resolves.toEqual({ byteLength: 4 });
    frame.remove();
  });

  it("accepts a transferred typed-array view", async () => {
    const parser = vi.fn(async (data) => ({ bytes: [...data] }));
    await expect(executeResumeParseRequest({ channel: RESUME_WORKER_CHANNEL, type: "parse", format: "txt", data: new Uint8Array([1, 2]) }, "txt", parser)).resolves.toEqual({ bytes: [1, 2] });
  });

  it("routes owned bytes to the selected parser and forwards progress", async () => {
    const onProgress = vi.fn();
    const parser = vi.fn(async (data, options) => {
      options.onProgress?.({ page: 1, totalPages: 1, percent: 100 });
      return { text: new TextDecoder().decode(data), pageCount: 1 };
    });
    const buffer = new ArrayBuffer(15);
    const bytes = new Uint8Array(buffer);
    bytes.set([77, 111, 114, 101, 84, 104, 97, 110, 32, 114, 101, 115, 117, 109, 101]);
    const result = await executeResumeParseRequest(
      { channel: RESUME_WORKER_CHANNEL, type: "parse", format: "pdf", data: buffer },
      "pdf",
      parser,
      onProgress,
    );

    expect(result).toMatchObject({ text: "MoreThan resume", pageCount: 1 });
    expect(onProgress).toHaveBeenCalledWith({ page: 1, totalPages: 1, percent: 100 });
  });

  it("rejects malformed requests and cross-format routing", async () => {
    const parser = vi.fn(async () => ({}));
    await expect(executeResumeParseRequest({ channel: RESUME_WORKER_CHANNEL, type: "parse", format: "pdf", data: "bad" }, "pdf", parser))
      .rejects.toMatchObject({ code: RESUME_WORKER_ERROR_CODES.PROTOCOL_INVALID });
    await expect(executeResumeParseRequest({ channel: RESUME_WORKER_CHANNEL, type: "parse", format: "txt", data: new ArrayBuffer(1) }, "pdf", parser))
      .rejects.toMatchObject({ code: RESUME_WORKER_ERROR_CODES.FORMAT_UNSUPPORTED });
    expect(parser).not.toHaveBeenCalled();
  });

  it("only forwards sanitized public error codes", () => {
    expect(sanitizeWorkerErrorCode({ code: "PDF_PASSWORD_REQUIRED" }, "pdf")).toBe("PDF_PASSWORD_REQUIRED");
    expect(sanitizeWorkerErrorCode({ code: "private/file/path" }, "docx")).toBe("DOCX_PARSE_FAILED");
    expect(sanitizeWorkerErrorCode(new Error("secret"), "txt")).toBe("TXT_UNSUPPORTED_INPUT");
  });
});
