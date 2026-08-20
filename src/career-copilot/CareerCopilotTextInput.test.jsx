import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const workerMock = vi.hoisted(() => ({ parseResumeInWorker: vi.fn() }));

vi.mock("./parsers/resumeParserWorkerClient.js", async (importOriginal) => ({
  ...(await importOriginal()),
  parseResumeInWorker: workerMock.parseResumeInWorker,
}));

import { CareerCopilotPage } from "./CareerCopilotPage.jsx";

function openMaterialScreen() {
  render(<CareerCopilotPage navigate={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /开始免费诊断/ }));
}

describe("CareerCopilot text input", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    workerMock.parseResumeInWorker.mockReset();
    workerMock.parseResumeInWorker.mockImplementation(async ({ format, data }) => {
      if (format !== "txt") throw new Error("unexpected format");
      const text = new TextDecoder().decode(data).trim();
      return {
        text,
        source: "txt",
        encoding: "utf-8",
        characterCount: text.replace(/\s/gu, "").length,
        paragraphCount: text.split(/\n{2,}/u).filter(Boolean).length,
        warnings: [],
      };
    });
  });

  it("reads a UTF-8 TXT file entirely in the browser", async () => {
    openMaterialScreen();
    const input = document.querySelector('input[type="file"]');
    const content = "教育经历\nMoreThan 大学 产品专业\n\n实习经历\n负责用户研究并完成产品复盘";
    const bytes = new TextEncoder().encode(content);
    const file = new File([bytes], "resume.txt", { type: "text/plain" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer.slice(0) });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("本地文本读取完成")).toBeInTheDocument();
    expect(screen.getByText(/TXT · 2 个文本段落/)).toBeInTheDocument();
  });

  it("accepts a pasted resume without uploading a file", async () => {
    openMaterialScreen();
    const content = "教育经历\nMoreThan 大学 产品专业\n\n项目经历\n负责用户研究并推动转化率提升 20%";
    fireEvent.change(screen.getByLabelText("粘贴简历全文"), { target: { value: content } });
    fireEvent.click(screen.getByRole("button", { name: /使用粘贴文本/ }));

    expect(await screen.findByText("本地文本读取完成")).toBeInTheDocument();
    expect(screen.getByText(/粘贴文本 · 2 个文本段落/)).toBeInTheDocument();
    expect(screen.getByText(/推动转化率提升 20%/, { selector: "pre" })).toBeInTheDocument();
    expect(screen.getByText(/2 条事实待确认/)).toBeInTheDocument();
  });

  it("masks sensitive fields in the local preview by default", async () => {
    openMaterialScreen();
    const content = "姓名：张三\n手机：13812345678\n邮箱：zhang.san@example.com\n地址：上海市浦东新区世纪大道100号\n\n教育经历\nMoreThan 大学 产品专业";
    fireEvent.change(screen.getByLabelText("粘贴简历全文"), { target: { value: content } });
    fireEvent.click(screen.getByRole("button", { name: /使用粘贴文本/ }));

    const preview = await screen.findByText(/姓名：张\*\*/, { selector: "pre" });
    expect(preview).toHaveTextContent("138****5678");
    expect(preview).toHaveTextContent("z***@example.com");
    expect(preview).toHaveTextContent("[详细地址已隐藏]");
    expect(preview).not.toHaveTextContent("张三");
    expect(preview).not.toHaveTextContent("13812345678");
    expect(screen.getByText(/4 项敏感信息已默认遮罩/)).toBeInTheDocument();
  });

  it("renders HTML-like resume text and file names as inert text", async () => {
    openMaterialScreen();
    const payload = '<img src="x" onerror="window.__resumeXss=true"><script>window.__resumeXss=true</script>\n教育经历\nMoreThan 大学 产品专业\n项目经历\n完成用户研究与复盘';
    fireEvent.change(screen.getByLabelText("粘贴简历全文"), { target: { value: payload } });
    fireEvent.click(screen.getByRole("button", { name: /使用粘贴文本/ }));

    const preview = await screen.findByText(/<script>window.__resumeXss=true<\/script>/, { selector: "pre" });
    expect(preview).toHaveTextContent('<img src="x" onerror="window.__resumeXss=true">');
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector("script:not([src])")).toBeNull();
    expect(window.__resumeXss).toBeUndefined();

    const input = document.querySelector('input[type="file"]');
    const bytes = new TextEncoder().encode("教育经历\nMoreThan 大学 产品专业\n项目经历\n完成用户研究与复盘");
    const file = new File([bytes], '<img src=x onerror=window.__resumeXss=true>.txt', { type: "text/plain" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer.slice(0) });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/本地文本读取完成/)).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(window.__resumeXss).toBeUndefined();
  });

  it("assembles structured manual fields into one local document", async () => {
    openMaterialScreen();
    fireEvent.click(screen.getByRole("tab", { name: /手工填写/ }));
    fireEvent.change(screen.getByLabelText("教育经历"), { target: { value: "MoreThan 大学，产品专业，2027 届" } });
    fireEvent.change(screen.getByLabelText("项目经历"), { target: { value: "完成用户访谈、方案设计和成果复盘" } });
    fireEvent.click(screen.getByRole("button", { name: /整理填写内容/ }));

    expect(await screen.findByText("本地文本读取完成")).toBeInTheDocument();
    expect(screen.getByText(/手工填写 · 2 个文本段落/)).toBeInTheDocument();
    expect(screen.getByText(/教育经历/, { selector: "pre" })).toBeInTheDocument();
  });

  it("supports roving focus and arrow keys in the text input tabs", () => {
    openMaterialScreen();
    const pasteTab = screen.getByRole("tab", { name: /粘贴完整简历/ });
    pasteTab.focus();
    fireEvent.keyDown(pasteTab, { key: "ArrowRight" });
    const manualTab = screen.getByRole("tab", { name: /手工填写/ });
    expect(manualTab).toHaveFocus();
    expect(manualTab).toHaveAttribute("aria-selected", "true");
    expect(manualTab).toHaveAttribute("aria-controls", "copilot-text-panel-manual");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", manualTab.id);
    fireEvent.keyDown(manualTab, { key: "Home" });
    expect(screen.getByRole("tab", { name: /粘贴完整简历/ })).toHaveFocus();
  });

  it("shows an actionable error for insufficient text", () => {
    openMaterialScreen();
    fireEvent.change(screen.getByLabelText("粘贴简历全文"), { target: { value: "只有姓名" } });
    fireEvent.click(screen.getByRole("button", { name: /使用粘贴文本/ }));

    expect(screen.getByRole("alert")).toHaveTextContent("内容太短");
    expect(screen.getByRole("alert")).toHaveTextContent("TXT_TOO_SHORT");
  });
});
