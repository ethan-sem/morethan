import { describe, expect, it, vi } from "vitest";
import { DOCX_PARSE_ERROR_CODES, extractDocxText, normalizeDocxText } from "./docxParser.js";

const encoder = new TextEncoder();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.byteLength;
  });
  return output;
}

function createStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  Object.entries(files).forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.byteLength, true);
    localView.setUint32(22, data.byteLength, true);
    localView.setUint16(26, nameBytes.byteLength, true);
    localParts.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.byteLength, true);
    centralView.setUint32(24, data.byteLength, true);
    centralView.setUint16(28, nameBytes.byteLength, true);
    centralView.setUint32(42, localOffset, true);
    centralParts.push(centralHeader, nameBytes);
    localOffset += localHeader.byteLength + nameBytes.byteLength + data.byteLength;
  });

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, Object.keys(files).length, true);
  endView.setUint16(10, Object.keys(files).length, true);
  endView.setUint32(12, centralDirectory.byteLength, true);
  endView.setUint32(16, localOffset, true);
  return concatBytes([...localParts, centralDirectory, end]);
}

function buildDocxFixture() {
  return createStoredZip({
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/_rels/document.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
    "word/document.xml": '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>MoreThan 智能求职助手</w:t></w:r></w:p><w:p><w:r><w:t>产品实习经历与量化项目成果</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
  });
}

describe("DOCX text normalization", () => {
  it("normalizes line endings while preserving paragraph breaks", () => {
    expect(normalizeDocxText("第一段  \r\n\r\n\r\n第二段\u00a0内容\r\n")).toBe("第一段\n\n第二段 内容");
  });
});

describe("extractDocxText", () => {
  it("uses only the raw-text API and returns sanitized warnings", async () => {
    const extractRawText = vi.fn(async () => ({
      value: "MoreThan Resume\n\nProduct Internship Experience",
      messages: [{ type: "warning", message: "private content" }],
    }));
    const result = await extractDocxText(new Uint8Array([1, 2, 3]), {
      minTextCharacters: 10,
      loadDependency: async () => ({ extractRawText }),
    });

    expect(extractRawText).toHaveBeenCalledWith({ arrayBuffer: expect.any(ArrayBuffer) });
    expect(result).toMatchObject({ paragraphCount: 2, warnings: [{ code: "DOCX_PARSER_WARNING", level: "warning" }] });
    expect(JSON.stringify(result.warnings)).not.toContain("private content");
  });

  it("identifies documents without enough text", async () => {
    const dependency = { extractRawText: vi.fn(async () => ({ value: "空", messages: [] })) };
    await expect(extractDocxText(new Uint8Array([1]), { loadDependency: async () => dependency }))
      .rejects.toMatchObject({ code: DOCX_PARSE_ERROR_CODES.NO_TEXT });
  });

  it("maps malformed zip errors to a fixed invalid-document result", async () => {
    const dependency = { extractRawText: vi.fn(async () => { throw new Error("Corrupted zip contains private name"); }) };
    await expect(extractDocxText(new Uint8Array([1]), { loadDependency: async () => dependency }))
      .rejects.toMatchObject({ code: DOCX_PARSE_ERROR_CODES.INVALID });
  });

  it("maps encrypted package errors separately from damaged documents", async () => {
    const dependency = { extractRawText: vi.fn(async () => { throw new Error("Encrypted zip are not supported"); }) };
    await expect(extractDocxText(new Uint8Array([1]), { loadDependency: async () => dependency }))
      .rejects.toMatchObject({ code: DOCX_PARSE_ERROR_CODES.PASSWORD_REQUIRED });
  });

  it("parses a generated DOCX with the installed Mammoth browser runtime", async () => {
    const result = await extractDocxText(buildDocxFixture(), {
      minTextCharacters: 10,
      loadDependency: async () => {
        const module = await import("mammoth/mammoth.browser.js");
        return module.default ?? module;
      },
    });
    expect(result.paragraphCount).toBe(2);
    expect(result.text).toContain("MoreThan 智能求职助手");
    expect(result.text).toContain("产品实习经历与量化项目成果");
  });
});
