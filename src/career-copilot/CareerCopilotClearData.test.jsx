import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CareerCopilotPage } from "./CareerCopilotPage.jsx";
import { FLOW_STORAGE_KEY } from "./lib/sessionStore.js";

describe("CareerCopilot removed data step migration", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("moves a legacy settings session directly to the action plan", async () => {
    window.sessionStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify({ version: 1, step: "settings", visited: ["intro", "actions", "settings"] }));
    render(<CareerCopilotPage navigate={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "完成真实诊断后，再生成你的行动计划" })).toBeInTheDocument();
    expect(screen.queryByText(/YOUR DATA|本次资料，只在当前页面处理|数据设置/)).not.toBeInTheDocument();
    await waitFor(() => {
      const stored = window.sessionStorage.getItem(FLOW_STORAGE_KEY);
      expect(stored).toContain('"step":"actions"');
      expect(stored).not.toContain("settings");
    });
  });
});
