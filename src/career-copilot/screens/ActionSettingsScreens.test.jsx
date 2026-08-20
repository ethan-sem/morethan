import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createByokMemoryVault } from "../privacy/byokMemoryVault.js";
import { SettingsScreen } from "./ActionSettingsScreens.jsx";

const SECRET = "sk-user-owned-secret-123456";

function ByokHarness() {
  const [vault] = useState(() => createByokMemoryVault());
  const [state, setState] = useState({ active: false, hasKey: false, provider: "openai-compatible" });
  const disable = () => { vault.clear(); setState({ active: false, hasKey: false, provider: "openai-compatible" }); };
  return <SettingsScreen onReset={vi.fn()} byok={{ available: true, ...state, onEnable: () => setState((current) => ({ ...current, active: true })), onDisable: disable, onStoreKey: (provider, apiKey) => { const result = vault.set(provider, apiKey); if (result.ok) setState({ active: true, hasKey: true, provider }); return result; }, onClearKey: () => { vault.clear(); setState((current) => ({ ...current, hasKey: false })); } }} />;
}

describe("BYOK settings experiment", () => {
  it("traps keyboard focus in the clear dialog, closes with Escape, and restores focus", () => {
    render(<SettingsScreen onReset={vi.fn()} byok={{ available: false }} />);
    const trigger = screen.getByRole("button", { name: "清除本次数据" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("alertdialog");
    const cancel = screen.getByRole("button", { name: "取消，保留数据" });
    expect(cancel).toHaveFocus();
    screen.getByRole("button", { name: "关闭清除确认" }).focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "确认清除且不可恢复" })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("requires explicit acknowledgement before enabling", () => {
    render(<ByokHarness />);
    const enable = screen.getByRole("button", { name: /主动开启实验模式/ });
    expect(enable).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(enable).toBeEnabled();
    fireEvent.click(enable);
    expect(screen.getByRole("heading", { name: "BYOK 实验模式已开启" })).toBeInTheDocument();
  });

  it("keeps a valid key memory-only and lets the user clear it", () => {
    render(<ByokHarness />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /主动开启实验模式/ }));
    const input = screen.getByLabelText("自有 API 密钥");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "new-password");
    fireEvent.change(input, { target: { value: SECRET } });
    fireEvent.click(screen.getByRole("button", { name: "临时保存到内存" }));
    expect(screen.getByRole("status")).toHaveTextContent("密钥已临时保存");
    expect(document.body).not.toHaveTextContent(SECRET);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "清除临时密钥" }));
    expect(screen.getByLabelText("自有 API 密钥")).toBeEnabled();
  });

  it("associates a rejected key with its announced error", () => {
    render(<ByokHarness />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /主动开启实验模式/ }));
    const input = screen.getByLabelText("自有 API 密钥");
    fireEvent.change(input, { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "临时保存到内存" }));
    const error = screen.getByRole("alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", error.id);
    fireEvent.change(input, { target: { value: "longer-key" } });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("does not render the experiment when the deployment flag is off", () => {
    render(<SettingsScreen onReset={vi.fn()} byok={{ available: false }} />);
    expect(screen.queryByRole("heading", { name: /BYOK/ })).not.toBeInTheDocument();
  });
});
