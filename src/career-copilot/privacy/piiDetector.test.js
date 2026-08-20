import { describe, expect, it } from "vitest";
import { createEmptyResumeFacts, validateResumeFacts } from "../domain/resumeFacts.js";
import { detectPrivateFields, maskPrivateFieldsInText, PII_DETECTOR_VERSION } from "./piiDetector.js";

const DOCUMENT_ID = "resume-document-1";

describe("local sensitive-field detection", () => {
  it("detects and masks labeled Chinese contact details without returning raw values", () => {
    const text = [
      "姓名：张三",
      "手机：+86 138-1234-5678",
      "邮箱：zhang.san@example.com",
      "详细地址：上海市浦东新区世纪大道100号2栋",
      "教育经历：MoreThan 大学 产品专业",
    ].join("\n");
    const fields = detectPrivateFields(text, { documentId: DOCUMENT_ID });
    const masked = maskPrivateFieldsInText(text, fields, { documentId: DOCUMENT_ID });

    expect(PII_DETECTOR_VERSION).toBe("1.0.0");
    expect(fields.map((field) => field.type)).toEqual(["name", "phone", "email", "address"]);
    expect(masked).toContain("姓名：张**");
    expect(masked).toContain("手机：138****5678");
    expect(masked).toContain("邮箱：z***@example.com");
    expect(masked).toContain("详细地址：[详细地址已隐藏]");
    expect(masked).not.toContain("张三");
    expect(masked).not.toContain("138-1234-5678");
    expect(masked).not.toContain("世纪大道100号");
    expect(JSON.stringify(fields)).not.toContain("zhang.san@example.com");
    expect(fields.every((field) => field.reviewStatus === "detected" && field.sourceRefs[0].documentId === DOCUMENT_ID)).toBe(true);
  });

  it("detects a resume-header name only when contact evidence is nearby", () => {
    const withContact = "李雷\n应届产品经理\n13812345678\nli.lei@example.com\n教育经历";
    const withoutContact = "李雷\n应届产品经理\n教育经历\nMoreThan 大学";
    expect(detectPrivateFields(withContact, { documentId: DOCUMENT_ID }).some((field) => field.type === "name" && field.confidence === "medium")).toBe(true);
    expect(detectPrivateFields(withoutContact, { documentId: DOCUMENT_ID }).some((field) => field.type === "name")).toBe(false);
  });

  it("supports English labels, landlines and a valid Chinese citizen ID number", () => {
    const text = "Name: Alice Zhang\nTel: 010-12345678\n身份证号：11010519491231002X\n项目成果：转化率提升20%";
    const fields = detectPrivateFields(text, { documentId: DOCUMENT_ID });
    const masked = maskPrivateFieldsInText(text, fields);

    expect(fields.map((field) => field.type)).toEqual(["name", "phone", "id_number"]);
    expect(masked).toContain("Name: A***");
    expect(masked).toContain("010-****5678");
    expect(masked).toContain("110***********002X");
  });

  it("does not mask ordinary years, metrics, target cities or invalid ID-like numbers", () => {
    const text = "目标城市：上海\n毕业时间：2027年6月\n项目用户数138000人\n编号：110105199902300021\n教育经历：MoreThan 大学";
    expect(detectPrivateFields(text, { documentId: DOCUMENT_ID })).toEqual([]);
  });

  it("stops an address before the next labeled field on the same line", () => {
    const text = "地址：北京市海淀区中关村大街27号 电话：13812345678";
    const fields = detectPrivateFields(text, { documentId: DOCUMENT_ID });
    const masked = maskPrivateFieldsInText(text, fields);
    expect(fields.map((field) => field.type)).toEqual(["address", "phone"]);
    expect(masked).toBe("地址：[详细地址已隐藏] 电话：138****5678");
  });

  it("supports explicitly labeled English addresses without masking ordinary prose", () => {
    const text = "Address: Room 801, 27 Example Road\nPreferred city: Shanghai";
    const fields = detectPrivateFields(text, { documentId: DOCUMENT_ID });
    expect(fields.map((field) => field.type)).toEqual(["address"]);
    expect(maskPrivateFieldsInText(text, fields)).toContain("Address: [详细地址已隐藏]");
  });

  it("returns deterministic source offsets compatible with ResumeFacts v1", () => {
    const text = "邮箱：career@example.com\n教育经历：MoreThan 大学 产品专业";
    const first = detectPrivateFields(text, { documentId: DOCUMENT_ID });
    const second = detectPrivateFields(text, { documentId: DOCUMENT_ID });
    const resumeFacts = createEmptyResumeFacts({
      documentId: DOCUMENT_ID,
      format: "paste",
      characterCount: text.replace(/\s/gu, "").length,
      textLength: text.length,
      now: "2026-08-09T12:00:00.000Z",
    });
    resumeFacts.privateFields = first;

    expect(first).toEqual(second);
    expect(text.slice(first[0].sourceRefs[0].startOffset, first[0].sourceRefs[0].endOffset)).toBe("career@example.com");
    expect(validateResumeFacts(resumeFacts)).toEqual({ valid: true, errors: [] });
  });

  it("honors dismissal and ignores invalid or foreign-document source ranges", () => {
    const text = "邮箱：career@example.com";
    const fields = detectPrivateFields(text, { documentId: DOCUMENT_ID });
    const dismissed = fields.map((field) => ({ ...field, reviewStatus: "dismissed" }));
    const foreign = fields.map((field) => ({ ...field, sourceRefs: [{ ...field.sourceRefs[0], documentId: "other-document" }] }));

    expect(maskPrivateFieldsInText(text, dismissed)).toBe(text);
    expect(maskPrivateFieldsInText(text, foreign, { documentId: DOCUMENT_ID })).toBe(text);
  });

  it("rejects invalid API inputs instead of producing ambiguous records", () => {
    expect(() => detectPrivateFields(null, { documentId: DOCUMENT_ID })).toThrow("PII_TEXT_INVALID");
    expect(() => detectPrivateFields("text", { documentId: "" })).toThrow("PII_DOCUMENT_ID_INVALID");
    expect(() => maskPrivateFieldsInText("text", null)).toThrow("PII_FIELDS_INVALID");
  });
});
