import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionsScreen } from "./ActionSettingsScreens.jsx";

describe("ActionsScreen", () => {
  it("ends the user flow without a data-settings jump", () => {
    render(<ActionsScreen actionPlan={null} />);

    expect(screen.getByRole("heading", { name: "完成真实诊断后，再生成你的行动计划" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /数据与设置|资料处理/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/YOUR DATA|本次资料，只在当前页面处理/)).not.toBeInTheDocument();
  });
});
