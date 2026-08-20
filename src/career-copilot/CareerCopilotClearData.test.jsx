import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CareerCopilotPage } from "./CareerCopilotPage.jsx";
import { FLOW_STORAGE_KEY } from "./lib/sessionStore.js";

describe("CareerCopilot one-click clear", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("requires confirmation, clears the flow and returns to the intro", async () => {
    window.sessionStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify({ version: 1, step: "settings", visited: ["intro", "settings"] }));
    window.localStorage.setItem("morethan-career-copilot-draft", "sensitive");
    window.localStorage.setItem("site-theme", "dark");
    render(<CareerCopilotPage navigate={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "本次资料，只在当前页面处理" }, { timeout: 5_000 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "清除本次数据" }));
    const dialog = screen.getByRole("alertdialog", { name: "确认清除本次所有数据？" });
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "取消，保留数据" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "取消，保留数据" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("morethan-career-copilot-draft")).toBe("sensitive");

    fireEvent.click(screen.getByRole("button", { name: "清除本次数据" }));
    fireEvent.click(screen.getByRole("button", { name: "确认清除且不可恢复" }));
    expect(await screen.findByRole("heading", { name: /先看清位置/ })).toBeInTheDocument();
    await waitFor(() => expect(window.sessionStorage.getItem(FLOW_STORAGE_KEY)).toBeNull());
    expect(window.localStorage.getItem("morethan-career-copilot-draft")).toBeNull();
    expect(window.localStorage.getItem("site-theme")).toBe("dark");
    expect(screen.getByText("本次数据已彻底清除，无法恢复")).toBeInTheDocument();
  });
});
