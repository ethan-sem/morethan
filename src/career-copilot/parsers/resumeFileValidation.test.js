import { describe, expect, it, vi } from "vitest";
import {
  FILE_VALIDATION_ERROR_CODES,
  getResumeErrorDetails,
  inferResumeFormatFromName,
  validateResumeFile,
} from "./resumeFileValidation.js";

function localFile(name, bytes, options = {}) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return {
    name,
    size: options.size ?? data.byteLength,
    arrayBuffer: options.arrayBuffer ?? vi.fn(async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)),
  };
}

function encryptedDocxContainer() {
  const signature = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const label = "EncryptedPackage";
  const encodedLabel = new Uint8Array(label.length * 2);
  for (let index = 0; index < label.length; index += 1) encodedLabel[index * 2] = label.charCodeAt(index);
  const result = new Uint8Array(signature.byteLength + encodedLabel.byteLength);
  result.set(signature);
  result.set(encodedLabel, signature.byteLength);
  return result;
}

describe("resume file validation", () => {
  it.each([
    ["resume.pdf", new TextEncoder().encode("%PDF-1.7\nfixture"), "pdf"],
    ["resume.docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), "docx"],
    ["resume.txt", new TextEncoder().encode("教育经历\nMoreThan 大学"), "txt"],
  ])("accepts a supported %s signature", async (name, bytes, format) => {
    await expect(validateResumeFile(localFile(name, bytes))).resolves.toMatchObject({ format, byteLength: bytes.byteLength });
  });

  it("normalizes supported extensions case-insensitively", () => {
    expect(inferResumeFormatFromName("RESUME.PDF")).toBe("pdf");
    expect(inferResumeFormatFromName("resume.pages")).toBeNull();
  });

  it("rejects an empty file before reading it", async () => {
    const file = localFile("empty.pdf", new Uint8Array(), { size: 0 });
    await expect(validateResumeFile(file)).rejects.toMatchObject({ code: FILE_VALIDATION_ERROR_CODES.EMPTY });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects a file over the configured size before reading it", async () => {
    const file = localFile("large.pdf", new Uint8Array([1]), { size: 101 });
    await expect(validateResumeFile(file, { maxBytes: 100 })).rejects.toMatchObject({ code: FILE_VALIDATION_ERROR_CODES.TOO_LARGE });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects unsupported extensions", async () => {
    await expect(validateResumeFile(localFile("resume.pages", new Uint8Array([1]))))
      .rejects.toMatchObject({ code: FILE_VALIDATION_ERROR_CODES.TYPE_UNSUPPORTED });
  });

  it("rejects renamed files whose signatures do not match", async () => {
    const renamedZip = localFile("resume.pdf", new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
    await expect(validateResumeFile(renamedZip)).rejects.toMatchObject({ code: FILE_VALIDATION_ERROR_CODES.TYPE_MISMATCH });
  });

  it("identifies password-protected DOCX containers", async () => {
    await expect(validateResumeFile(localFile("protected.docx", encryptedDocxContainer())))
      .rejects.toMatchObject({ code: FILE_VALIDATION_ERROR_CODES.ENCRYPTED_DOCX });
  });

  it("does not mistake a legacy Word container for an encrypted DOCX", async () => {
    const legacyWord = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    await expect(validateResumeFile(localFile("renamed.docx", legacyWord)))
      .rejects.toMatchObject({ code: FILE_VALIDATION_ERROR_CODES.TYPE_MISMATCH });
  });

  it("rejects binary data disguised as TXT", async () => {
    const binary = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 0]);
    await expect(validateResumeFile(localFile("renamed.txt", binary)))
      .rejects.toMatchObject({ code: FILE_VALIDATION_ERROR_CODES.TYPE_MISMATCH });
  });

  it("maps browser read failures without exposing their message", async () => {
    const file = localFile("resume.pdf", new Uint8Array([1]), { arrayBuffer: vi.fn(async () => { throw new Error("private path"); }) });
    let caught;
    try {
      await validateResumeFile(file);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: FILE_VALIDATION_ERROR_CODES.READ_FAILED });
    expect(caught.message).not.toContain("private path");
  });

  it("returns a clear title and next action for parser errors", () => {
    expect(getResumeErrorDetails("PDF_PASSWORD_REQUIRED", "这份 PDF 受密码保护。")).toMatchObject({
      title: "PDF 受密码保护",
      action: expect.stringContaining("解除"),
    });
  });
});
