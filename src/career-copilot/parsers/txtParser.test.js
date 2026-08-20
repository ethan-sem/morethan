import { describe, expect, it } from "vitest";
import {
  decodeTextBytes,
  extractTxtText,
  normalizePlainText,
  preparePlainText,
  TXT_PARSE_ERROR_CODES,
} from "./txtParser.js";

function encodeUtf16Le(text) {
  const result = new Uint8Array(2 + text.length * 2);
  result.set([0xff, 0xfe]);
  const view = new DataView(result.buffer);
  for (let index = 0; index < text.length; index += 1) {
    view.setUint16(2 + index * 2, text.charCodeAt(index), true);
  }
  return result;
}

describe("TXT parser", () => {
  it("extracts and normalizes a UTF-8 resume", async () => {
    const source = "教育经历  MoreThan 大学 产品专业 2023-2027  \r\n\r\n项目经历\r\n负责用户研究并提升转化率 20%";
    const result = await extractTxtText(new TextEncoder().encode(source), { minTextCharacters: 12 });

    expect(result.encoding).toBe("utf-8");
    expect(result.source).toBe("txt");
    expect(result.paragraphCount).toBe(2);
    expect(result.text).not.toContain("\r");
    expect(result.text).toContain("提升转化率 20%");
  });

  it("detects a UTF-16LE BOM", () => {
    const result = decodeTextBytes(encodeUtf16Le("教育经历：MoreThan 大学"));
    expect(result.encoding).toBe("utf-16le");
    expect(result.text).toBe("教育经历：MoreThan 大学");
  });

  it("removes unsafe control characters while preserving paragraph breaks", () => {
    expect(normalizePlainText("项目\u0000经历  \n\n\n成果\u0007：增长 30%  ")).toBe("项目经历\n\n成果：增长 30%");
  });

  it("uses the same normalized result for pasted and manual text", () => {
    const pasted = preparePlainText("教育经历\nMoreThan 大学\n\n项目经历\n完成用户研究和产品方案", { source: "paste", minTextCharacters: 8 });
    const manual = preparePlainText("教育经历\nMoreThan 大学\n\n技能与证书\n英语、数据分析", { source: "manual", minTextCharacters: 8 });

    expect(pasted.source).toBe("paste");
    expect(manual.source).toBe("manual");
    expect(pasted.paragraphCount).toBe(2);
    expect(manual.encoding).toBe("unicode");
  });

  it("rejects content that is too short for diagnosis", () => {
    expect(() => preparePlainText("只有姓名", { source: "paste" })).toThrowError(
      expect.objectContaining({ code: TXT_PARSE_ERROR_CODES.TOO_SHORT }),
    );
  });

  it("stops before reading when the request is aborted", async () => {
    const controller = new AbortController();
    controller.abort("test");
    await expect(extractTxtText(new Uint8Array([1, 2, 3]), { signal: controller.signal })).rejects.toMatchObject({
      code: TXT_PARSE_ERROR_CODES.ABORTED,
    });
  });
});
