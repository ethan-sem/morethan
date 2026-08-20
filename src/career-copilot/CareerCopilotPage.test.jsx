import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CareerCopilotPage } from "./CareerCopilotPage.jsx";

describe("CareerCopilotPage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("starts without login and advances to local material input", () => {
    const { container } = render(<CareerCopilotPage navigate={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /先看清位置/ })).toBeInTheDocument();
    expect(container.querySelector("main")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "智能求职助手当前步骤" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /开始免费诊断/ }));
    const materialHeading = screen.getByRole("heading", { name: "从一份真实简历开始" });
    expect(materialHeading).toBeInTheDocument();
    expect(materialHeading).toHaveFocus();
    expect(materialHeading).toHaveAttribute("tabindex", "-1");
    expect(screen.getByText(/支持 PDF、DOCX、TXT/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /请先提供简历材料/ })).toBeDisabled();
  });

  it("opens the example report through an explicit state transition", async () => {
    render(<CareerCopilotPage navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /查看示例报告/ }));
    expect(await screen.findByRole("heading", { name: /你的经历有产品感/ })).toBeInTheDocument();
  });
});
