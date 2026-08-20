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
  return document.querySelector('input[type="file"]');
}

function browserFile(bytes, name, type) {
  const data = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(bytes);
  const file = new File([data], name, { type });
  Object.defineProperty(file, "arrayBuffer", { value: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
  return file;
}

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 1]);
const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

describe("CareerCopilot PDF upload", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    workerMock.parseResumeInWorker.mockReset();
  });

  it("shows a local text preview after PDF extraction", async () => {
    workerMock.parseResumeInWorker.mockImplementation(async ({ onProgress }) => {
      onProgress?.({ page: 2, totalPages: 2, percent: 100 });
      return {
      text: "MoreThan 产品实习简历 项目经历与量化成果",
      pageCount: 2,
      textPageCount: 2,
      characterCount: 24,
      pages: [],
      warnings: [],
      };
    });
    const input = openMaterialScreen();
    fireEvent.change(input, { target: { files: [browserFile(PDF_BYTES, "resume.pdf", "application/pdf")] } });

    expect(await screen.findByText("本地文本读取完成")).toBeInTheDocument();
    expect(screen.getByText(/MoreThan 产品实习简历/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /确认文本并继续/ })).toBeEnabled();
    expect(workerMock.parseResumeInWorker).toHaveBeenCalledWith(expect.objectContaining({ format: "pdf", data: expect.any(Uint8Array) }));
  });

  it("explains that scanned PDFs need a text alternative", async () => {
    workerMock.parseResumeInWorker.mockRejectedValue({ code: "PDF_NO_TEXT_LAYER" });
    const input = openMaterialScreen();
    fireEvent.change(input, { target: { files: [browserFile(PDF_BYTES, "scan.pdf", "application/pdf")] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("当前版本暂不支持 OCR");
    expect(screen.getByRole("button", { name: /请先提供简历材料/ })).toBeDisabled();
  });

  it("shows a local text preview after DOCX extraction", async () => {
    workerMock.parseResumeInWorker.mockResolvedValue({
      text: "MoreThan 校招简历 产品项目与实习经历",
      paragraphCount: 3,
      characterCount: 21,
      warnings: [],
    });
    const input = openMaterialScreen();
    const type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    fireEvent.change(input, { target: { files: [browserFile(DOCX_BYTES, "resume.docx", type)] } });

    expect(await screen.findByText("本地文本读取完成")).toBeInTheDocument();
    expect(screen.getByText(/DOCX · 3 个文本段落/)).toBeInTheDocument();
    expect(workerMock.parseResumeInWorker).toHaveBeenCalledWith(expect.objectContaining({ format: "docx" }));
  });

  it("rejects oversized files before a parser is loaded", async () => {
    const input = openMaterialScreen();
    const file = { name: "large.pdf", size: 10 * 1024 * 1024 + 1, arrayBuffer: vi.fn() };
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("文件超过 10MB");
    expect(screen.getByRole("alert")).toHaveTextContent("请压缩或重新导出");
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(workerMock.parseResumeInWorker).not.toHaveBeenCalled();
  });

  it("rejects a renamed file when its content does not match the extension", async () => {
    const input = openMaterialScreen();
    fireEvent.change(input, { target: { files: [browserFile(DOCX_BYTES, "renamed.pdf", "application/pdf")] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("文件格式不一致");
    expect(screen.getByRole("alert")).toHaveTextContent("FILE_TYPE_MISMATCH");
    expect(workerMock.parseResumeInWorker).not.toHaveBeenCalled();
  });

  it("distinguishes password-protected PDFs from damaged PDFs", async () => {
    workerMock.parseResumeInWorker.mockRejectedValue({ code: "PDF_PASSWORD_REQUIRED" });
    const input = openMaterialScreen();
    fireEvent.change(input, { target: { files: [browserFile(PDF_BYTES, "protected.pdf", "application/pdf")] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("PDF 受密码保护");
    expect(screen.getByRole("alert")).toHaveTextContent("解除打开密码");
  });

  it("shows a recovery action when the worker reaches its timeout", async () => {
    workerMock.parseResumeInWorker.mockRejectedValue({ code: "WORKER_TIMEOUT" });
    const input = openMaterialScreen();
    fireEvent.change(input, { target: { files: [browserFile(PDF_BYTES, "slow.pdf", "application/pdf")] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("本地解析超时");
    expect(screen.getByRole("alert")).toHaveTextContent("直接粘贴简历文字");
    expect(screen.getByRole("alert")).toHaveTextContent("WORKER_TIMEOUT");
  });

  it("lets the user terminate an active parsing worker", async () => {
    let receivedSignal;
    workerMock.parseResumeInWorker.mockImplementation(({ signal }) => {
      receivedSignal = signal;
      return new Promise(() => {});
    });
    const input = openMaterialScreen();
    fireEvent.change(input, { target: { files: [browserFile(PDF_BYTES, "resume.pdf", "application/pdf")] } });

    const cancel = await screen.findByRole("button", { name: "停止解析" });
    expect(screen.getByText(/独立解析线程/)).toBeInTheDocument();
    fireEvent.click(cancel);
    expect(receivedSignal.aborted).toBe(true);
    expect(screen.queryByRole("button", { name: "停止解析" })).not.toBeInTheDocument();
  });
});
