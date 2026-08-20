import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConclusionSourceBadges } from "./ConclusionSourceBadges.jsx";
import { createResumeFact } from "../domain/resumeFacts.js";

const NOW = "2026-08-14T00:00:00.000Z";

function provenance(publicSources = []) {
  return {
    items: [{
      targetType: "profile_conclusion",
      targetId: "conclusion-001",
      sourceTypes: publicSources.length ? ["confirmed_fact", "rule_inference", "public_source"] : ["confirmed_fact", "rule_inference"],
      factIds: ["fact-project"],
      ruleIds: ["rule-evidence-result"],
      publicSources,
      explanation: "该结论引用了用户已确认事实，并由本地规则形成判断。",
    }],
  };
}

const fact = createResumeFact({
  id: "fact-project",
  category: "project",
  provenance: "extracted",
  review: { status: "confirmed", updatedAt: NOW },
  sourceRefs: [{ documentId: "doc-001", startOffset: 20, endOffset: 88, page: 2, section: "项目经历" }],
  data: { name: "校园用户研究项目", role: "负责人", actions: ["访谈 20 名用户"], methods: ["用户访谈"], results: [], metrics: [], technologies: ["Figma"] },
});

describe("ConclusionSourceBadges evidence trace", () => {
  it("expands a confirmed fact and rule trace without showing resume raw text", () => {
    render(<ConclusionSourceBadges provenance={provenance()} targetType="profile_conclusion" targetId="conclusion-001" facts={[fact]} />);
    const summary = screen.getByText("查看判断依据");
    fireEvent.click(summary);
    expect(summary.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("项目经历 · 已确认")).toBeInTheDocument();
    expect(screen.getByText(/校园用户研究项目 · 负责人/)).toBeInTheDocument();
    expect(screen.getByText("来源位置：第 2 页 · 项目经历")).toBeInTheDocument();
    expect(screen.getByText("rule-evidence-result")).toBeInTheDocument();
    expect(screen.getByText("本条判断未使用公开资料。")).toBeInTheDocument();
  });

  it("shows a verified public source as an external link", () => {
    const source = { id: "source-001", title: "示例公司招聘官网", url: "https://careers.example.com/", verifiedAt: "2026-08-14" };
    render(<ConclusionSourceBadges provenance={provenance([source])} targetType="profile_conclusion" targetId="conclusion-001" facts={[fact]} />);
    fireEvent.click(screen.getByText("查看判断依据"));
    expect(screen.getByRole("link", { name: "示例公司招聘官网" })).toHaveAttribute("href", source.url);
    expect(screen.getByText("核验于 2026-08-14")).toBeInTheDocument();
  });

  it("keeps an unavailable referenced fact visible as an auditable identifier", () => {
    render(<ConclusionSourceBadges provenance={provenance()} targetType="profile_conclusion" targetId="conclusion-001" facts={[]} />);
    fireEvent.click(screen.getByText("查看判断依据"));
    expect(screen.getByText("该事实当前不可查看")).toBeInTheDocument();
    expect(screen.getByText("引用编号：fact-project")).toBeInTheDocument();
  });
});
