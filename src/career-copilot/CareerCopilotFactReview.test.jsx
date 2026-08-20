import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CareerCopilotPage } from "./CareerCopilotPage.jsx";

const RESUME_TEXT = [
  "教育经历",
  "MoreThan 大学 | 信息管理专业 | 本科 | 2023-2027",
  "",
  "项目经历",
  "用户研究项目 | 项目负责人 | 2024.03-2024.06",
  "通过用户访谈完成需求分析，覆盖 4 个业务场景",
].join("\n");

async function openFactsScreen(resumeText = RESUME_TEXT) {
  render(<CareerCopilotPage navigate={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /开始免费诊断/ }));
  fireEvent.change(screen.getByLabelText("粘贴简历全文"), { target: { value: resumeText } });
  fireEvent.click(screen.getByRole("button", { name: /使用粘贴文本/ }));
  expect(await screen.findByText("本地文本读取完成")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /确认文本并继续/ }));
  expect(await screen.findByRole("heading", { name: "先确认事实，再形成判断" })).toBeInTheDocument();
}

describe("CareerCopilot fact review", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("shows real facts and blocks analysis until every fact is resolved", async () => {
    await openFactsScreen();
    expect(screen.getByText(/MoreThan 大学 · 本科 · 信息管理/)).toBeInTheDocument();
    expect(screen.getByText(/通过用户访谈完成需求分析/, { selector: "blockquote span" })).toBeInTheDocument();
    expect(screen.getByText("2", { selector: ".copilot-review-summary .is-pending span" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /完成事实确认/ })).toBeDisabled();

    while (screen.queryAllByRole("button", { name: "正确" }).length) {
      fireEvent.click(screen.getAllByRole("button", { name: "正确" })[0]);
    }

    expect(screen.getByText(/将使用 2 条已确认事实进入后续分析/)).toBeInTheDocument();
    const complete = screen.getByRole("button", { name: /完成事实确认/ });
    expect(complete).toBeEnabled();
    fireEvent.click(complete);
    expect(await screen.findByRole("heading", { name: "告诉我们，你主要看什么" })).toBeInTheDocument();
  });

  it("supports editing, excluding, adding and deleting facts in memory", async () => {
    await openFactsScreen();
    fireEvent.click(screen.getAllByRole("button", { name: /修改/ })[0]);
    fireEvent.change(screen.getByLabelText("学校/院校"), { target: { value: "MoreThan 商学院" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(screen.getByText(/MoreThan 商学院 · 本科/)).toBeInTheDocument();

    const educationCard = screen.getByText(/MoreThan 商学院 · 本科/).closest("article");
    fireEvent.click(within(educationCard).getByRole("button", { name: /不参与分析/ }));
    expect(within(educationCard).getByRole("button", { name: /恢复待确认/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /新增事实/ }));
    fireEvent.change(screen.getByLabelText("事实类型"), { target: { value: "skill" } });
    fireEvent.change(screen.getByLabelText("技能名称"), { target: { value: "SQL" } });
    fireEvent.click(screen.getByRole("button", { name: "保存新增事实" }));
    const skillSummary = screen.getByText(/^SQL$/);
    expect(skillSummary).toBeInTheDocument();

    const skillCard = skillSummary.closest("article");
    fireEvent.click(within(skillCard).getByRole("button", { name: /^删除$/ }));
    expect(within(skillCard).getByText("确认删除？")).toBeInTheDocument();
    fireEvent.click(within(skillCard).getByRole("button", { name: /^删除$/ }));
    expect(screen.queryByText(/^SQL$/)).not.toBeInTheDocument();
  });

  it("marks an unverified fact uncertain and keeps it out of analysis", async () => {
    await openFactsScreen();
    const firstCard = screen.getByText(/MoreThan 大学 · 本科/).closest("article");
    fireEvent.click(within(firstCard).getByRole("button", { name: "无法确认" }));
    expect(within(firstCard).getByText("无法确认", { selector: "em" })).toBeInTheDocument();
    expect(within(firstCard).getByRole("button", { name: /恢复待确认/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "正确" }));
    expect(screen.getByText(/将使用 1 条已确认事实进入后续分析/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /完成事实确认/ })).toBeEnabled();
  });

  it("shows low-confidence guidance before the user confirms an inferred fact", async () => {
    const lowConfidenceText = "教育经历\nMoreThan 大学\n参与学生项目与课程学习";
    render(<CareerCopilotPage navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /开始免费诊断/ }));
    fireEvent.change(screen.getByLabelText("粘贴简历全文"), { target: { value: lowConfidenceText } });
    fireEvent.click(screen.getByRole("button", { name: /使用粘贴文本/ }));
    expect(await screen.findByText("本地文本读取完成")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /确认文本并继续/ }));

    expect(await screen.findByText(/信息不完整：建议确认或补充/)).toBeInTheDocument();
    expect(screen.getByText(/建议补充：学历/)).toBeInTheDocument();
  });

  it("lets the user resolve timeline warnings without changing fact truth states", async () => {
    const overlappingResume = [
      "实习经历",
      "甲公司 | 产品实习生 | 2024.06-2024.09",
      "负责用户调研与需求整理",
      "乙公司 | 运营实习生 | 2024.08-2024.12",
      "负责活动复盘与数据分析",
    ].join("\n");

    await openFactsScreen(overlappingResume);
    expect(screen.getByRole("heading", { name: "有 1 项时间信息待处理" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认需注意" }));
    expect(screen.getByRole("heading", { name: "有 0 项时间信息待处理" })).toBeInTheDocument();
    expect(screen.getByText("已标记需注意")).toBeInTheDocument();
    expect(screen.getByText("2", { selector: ".copilot-review-summary .is-pending span" })).toBeInTheDocument();
  });
});
