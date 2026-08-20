import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import companyRolePool from "../../public/data/career-copilot/company-role-pool.json";
import { createCompanyRoleRecommendations } from "./domain/companyRoleRecommendations.js";
import { CompanyRoleLoadState, CompanyRoleTargets } from "./screens/AnalysisScreens.jsx";

describe("M5-06 company role target cards", () => {
  it("renders company, direction, source, review dates and official links", () => {
    const recommendations = createCompanyRoleRecommendations(companyRolePool, { directionId: "product-manager", recruitmentType: "internship", asOfDate: "2026-08-14" });
    render(<CompanyRoleTargets recommendations={recommendations} />);
    expect(screen.getByRole("heading", { name: "产品经理：带来源的公司目标池" })).toBeInTheDocument();
    expect(screen.getByText(/数据核验状态：当前有效/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "大疆" })).toBeInTheDocument();
    expect(screen.getByText("大疆校园招聘")).toBeInTheDocument();
    expect(screen.getAllByText("2026-08-13").length).toBe(5);
    expect(screen.getAllByText("2026-08-20").length).toBe(5);
    expect(screen.getAllByRole("link", { name: /打开官方招聘入口/ })).toHaveLength(5);
  });

  it("shows an explicit stale warning while preserving official links", () => {
    const recommendations = createCompanyRoleRecommendations(companyRolePool, { directionId: "product-manager", asOfDate: "2026-08-21" });
    render(<CompanyRoleTargets recommendations={recommendations} />);
    expect(screen.getByRole("status")).toHaveTextContent(/已超过复核期限/);
    expect(screen.getByText(/数据核验状态：待自行核实/)).toBeInTheDocument();
    expect(screen.getAllByText("待自行核实")).toHaveLength(5);
    expect(screen.getAllByRole("link", { name: /打开官方招聘入口/ })).toHaveLength(5);
    expect(screen.queryByText("入口已核验")).not.toBeInTheDocument();
  });

  it("renders a conservative empty state for uncovered directions", () => {
    const recommendations = createCompanyRoleRecommendations(companyRolePool, { directionId: "uncovered", asOfDate: "2026-08-14" });
    render(<CompanyRoleTargets recommendations={recommendations} />);
    expect(screen.getByRole("heading", { name: "当前方向暂无可展示的公司目标池" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps an independent fallback when static company data fails", () => {
    render(<CompanyRoleLoadState status="error" />);
    expect(screen.getByRole("heading", { name: "公司目标池暂时无法读取" })).toBeInTheDocument();
    expect(screen.getByText(/个人诊断、优势短板与行动建议不受影响/)).toBeInTheDocument();
  });
});
