import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CareerCopilotPage } from "./CareerCopilotPage.jsx";
import { FLOW_STORAGE_KEY } from "./lib/sessionStore.js";

vi.mock("./lib/companyRolePoolLoader.js", async () => ({
  loadCompanyRolePoolByDirection: vi.fn(async () => (await import("../../public/data/career-copilot/company-role-pool.json")).default),
}));

const RESUME_TEXT = [
  "项目经历",
  "校园用户研究项目 | 项目负责人 | 2025.03-2025.06",
  "访谈 20 名用户并整理产品需求，使用 Figma 形成覆盖 4 个场景的需求清单",
].join("\n");

describe("CareerCopilot local profile analysis flow", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    window.print = vi.fn();
  });

  it("turns confirmed facts and the selected direction into a traceable local report", async () => {
    render(<CareerCopilotPage navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /开始免费诊断/ }));
    fireEvent.change(screen.getByLabelText("粘贴简历全文"), { target: { value: RESUME_TEXT } });
    fireEvent.click(screen.getByRole("button", { name: /使用粘贴文本/ }));
    expect(await screen.findByText("本地文本读取完成")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /确认文本并继续/ }));
    expect(await screen.findByRole("heading", { name: "先确认事实，再形成判断" })).toBeInTheDocument();

    while (screen.queryAllByRole("button", { name: "正确" }).length) fireEvent.click(screen.getAllByRole("button", { name: "正确" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /完成事实确认/ }));
    expect(await screen.findByRole("heading", { name: "告诉我们，你主要看什么" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "请先帮我判断" }));
    expect(screen.getByRole("button", { name: "请先帮我判断" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /保存目标/ }));
    expect(await screen.findByRole("heading", { name: "先回答关键缺口，再对齐目标 JD" })).toBeInTheDocument();
    const answerGroups = screen.queryAllByRole("group", { name: /的回答/ });
    if (answerGroups.length) {
      const firstQuestion = answerGroups[0];
      fireEvent.click(firstQuestion.querySelector("button:nth-of-type(2)"));
      expect(firstQuestion.querySelector("button:nth-of-type(2)")).toHaveAttribute("aria-pressed", "true");
    }
    fireEvent.click(screen.getByRole("button", { name: /跳过 JD 并继续/ }));

    expect(await screen.findByText(/已使用浏览器本地规则匹配方向与经历证据/)).toBeInTheDocument();
    expect(screen.getByText(/未提供 JD，使用通用岗位族规则/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /查看本地分析结果/ }));
    expect(await screen.findByText(/基于 1 条已确认事实/)).toBeInTheDocument();
    expect(screen.getAllByText(/来自已确认事实：校园用户研究项目 · 项目负责人/).length).toBeGreaterThan(0);
    expect(screen.getByText(/分析仅基于用户已确认且写入简历的事实/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /方向判断：优先验证/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "优势与短板，都回到简历证据" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /核心优势/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /主要短板与信息缺口/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "四层是投递组合，不是公司排名" })).toBeInTheDocument();
    expect(screen.getByText(/暂依据方向画像；补充 JD 后可进一步校准/)).toBeInTheDocument();
    expect(screen.getByText(/四层是本次投递组合策略，不是公司排名/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /带来源的公司目标池/ })).toBeInTheDocument();
    expect(screen.getByText(/数据核验状态：当前有效/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /打开官方招聘入口/ })).toHaveLength(5);
    expect(screen.getAllByText("核验日期")).toHaveLength(5);
    expect(screen.getByText(/公司目标池不代表实时职位/)).toBeInTheDocument();
    expect(screen.getAllByText("已确认事实").length).toBeGreaterThan(0);
    expect(screen.getAllByText("规则推断").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "证据不够时，不强行下结论" })).toBeInTheDocument();
    expect(screen.getAllByText(/条件式建议|需补事实|已省略|待回答/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/结论来源：.*公开资料/)).not.toBeInTheDocument();
    expect(screen.queryByText(/示例内容由本地规则生成/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "下一步：按三个时间窗推进" })).toBeInTheDocument();
    expect(screen.getByText(/共 5 项，预计/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "生成方式与使用边界" })).toBeInTheDocument();
    expect(screen.getByText("本地规则生成（非生成式 AI）")).toBeInTheDocument();
    expect(screen.getByText("敏感内容仅驻留当前页面")).toBeInTheDocument();
    expect(screen.getByText("不构成录用保证")).toBeInTheDocument();
    expect(screen.getByText(/资料处于复核期内 · 查看日期/)).toBeInTheDocument();
    expect(screen.getByText(/不代表岗位仍在招聘/)).toBeInTheDocument();
    expect(screen.getByText(/不代表招聘方评价、真实能力上限、面试邀请、录用概率或 offer 保证/)).toBeInTheDocument();
    expect(screen.getByText(/本次内容不会自动保存/)).toBeInTheDocument();
    const flowStorage = window.sessionStorage.getItem(FLOW_STORAGE_KEY);
    expect(flowStorage).not.toContain(RESUME_TEXT);
    expect(flowStorage).not.toContain("校园用户研究项目");
    expect(window.localStorage.length).toBe(0);
    const leaveBeforeExport = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaveBeforeExport);
    expect(leaveBeforeExport.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /打印 \/ 保存 PDF/ }));
    expect(window.print).toHaveBeenCalledTimes(1);
    const leaveAfterPrintOnly = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaveAfterPrintOnly);
    expect(leaveAfterPrintOnly.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /复制脱敏文本/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1));
    const copiedText = navigator.clipboard.writeText.mock.calls[0][0];
    expect(copiedText).toContain("MoreThan 智能求职助手｜脱敏诊断报告");
    expect(copiedText).toContain("【核心优势】");
    expect(copiedText).not.toContain(RESUME_TEXT);
    expect(screen.getByRole("status")).toHaveTextContent("脱敏报告已复制到剪贴板");
    await waitFor(() => expect(screen.queryByText(/本次内容不会自动保存/)).not.toBeInTheDocument());
    const leaveAfterExport = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaveAfterExport);
    expect(leaveAfterExport.defaultPrevented).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /查看行动计划/ }));
    expect(await screen.findByRole("heading", { name: "把判断变成三个时间窗内的动作" }, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "48 小时" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "7 天" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "30 天" })).toBeInTheDocument();
    expect(screen.getByText(/收集 3–5 份.*真实 JD/)).toBeInTheDocument();
    expect(screen.getByText(/勾选状态仅保存在当前页面内存/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("结论来源：规则推断").length).toBeGreaterThan(0);
    const firstCompleteButton = screen.getAllByRole("button", { name: /标记完成：/ })[0];
    fireEvent.click(firstCompleteButton);
    expect(firstCompleteButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1/5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /数据与设置/ }));
    expect(await screen.findByRole("heading", { name: "本次资料，只在当前页面处理" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /行动计划/ }));
    expect(await screen.findByText("1/5")).toBeInTheDocument();
  }, 20000);

  it("extracts an optional JD locally and shows actionable validation errors", async () => {
    render(<CareerCopilotPage navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /开始免费诊断/ }));
    fireEvent.change(screen.getByLabelText("粘贴简历全文"), { target: { value: RESUME_TEXT } });
    fireEvent.click(screen.getByRole("button", { name: /使用粘贴文本/ }));
    expect(await screen.findByText("本地文本读取完成")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /确认文本并继续/ }));
    expect(await screen.findByRole("heading", { name: "先确认事实，再形成判断" })).toBeInTheDocument();
    while (screen.queryAllByRole("button", { name: "正确" }).length) fireEvent.click(screen.getAllByRole("button", { name: "正确" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /完成事实确认/ }));
    expect(await screen.findByRole("heading", { name: "告诉我们，你主要看什么" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /保存目标/ }));
    expect(await screen.findByRole("heading", { name: "先回答关键缺口，再对齐目标 JD" })).toBeInTheDocument();

    const jdInput = screen.getByLabelText("目标职位 JD");
    fireEvent.change(jdInput, { target: { value: "产品经理实习生" } });
    fireEvent.click(screen.getByRole("button", { name: /提取 JD 并继续/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/JD 内容过短/);
    expect(await screen.findByRole("heading", { name: "先回答关键缺口，再对齐目标 JD" })).toBeInTheDocument();

    fireEvent.change(jdInput, { target: { value: "岗位职责\n负责用户调研和需求分析\n任职要求\n本科及以上学历，熟练使用 SQL\n加分项\n熟悉 Figma 优先" } });
    fireEvent.click(screen.getByRole("button", { name: /提取 JD 并继续/ }));
    expect(await screen.findByText(/提取 1 项职责与 1 项硬要求/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /查看本地分析结果/ }));
    expect(await screen.findByRole("heading", { name: "逐项看证据，不猜录取概率" })).toBeInTheDocument();
    expect(screen.getByText(/匹配结果只说明已确认简历事实中是否存在相关证据/)).toBeInTheDocument();
    expect(screen.getAllByText(/熟练使用 SQL/).length).toBeGreaterThan(0);
    expect(screen.getByText(/依据方向画像与当前 JD 样本/)).toBeInTheDocument();
    expect(screen.getAllByText("规则推断").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /查看行动计划/ }));
    expect(await screen.findByText(/熟练使用 SQL/)).toBeInTheDocument();
    expect(screen.getAllByText("jd_gap:not_found").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "48 小时" })).toBeInTheDocument();
  });

  it("registers an internal-navigation guard while memory-only work is unsaved", async () => {
    let leaveGuard = () => true;
    const registerLeaveGuard = vi.fn((guard) => {
      leaveGuard = guard;
      return () => {};
    });
    window.confirm = vi.fn(() => false);
    render(<CareerCopilotPage navigate={vi.fn()} registerLeaveGuard={registerLeaveGuard} />);
    fireEvent.click(screen.getByRole("button", { name: /开始免费诊断/ }));
    fireEvent.change(screen.getByLabelText("粘贴简历全文"), { target: { value: RESUME_TEXT } });
    fireEvent.click(screen.getByRole("button", { name: /使用粘贴文本/ }));
    expect(await screen.findByText("本地文本读取完成")).toBeInTheDocument();
    await waitFor(() => expect(registerLeaveGuard).toHaveBeenCalled());
    expect(leaveGuard()).toBe(false);
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/不会自动保存/));
  });
});
