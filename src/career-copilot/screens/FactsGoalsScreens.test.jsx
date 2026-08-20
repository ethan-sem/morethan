import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoalsScreen } from "./FactsGoalsScreens.jsx";

function GoalsHarness() {
  const [stage, setStage] = useState("internship");
  const [direction, setDirection] = useState("product-manager");
  const [backupDirections, setBackupDirections] = useState([]);
  const [targetLocations, setTargetLocations] = useState(["上海"]);
  const [applicationStart, setApplicationStart] = useState("30_days");
  const [hardConstraints, setHardConstraints] = useState("");
  const [exclusions, setExclusions] = useState({ companies: "", locations: "", industries: "" });
  const changeDirection = (value) => {
    setDirection(value);
    setBackupDirections((current) => current.filter((id) => id !== value));
  };
  return <GoalsScreen stage={stage} direction={direction} backupDirections={backupDirections} targetLocations={targetLocations} applicationStart={applicationStart} hardConstraints={hardConstraints} exclusions={exclusions} onStageChange={setStage} onDirectionChange={changeDirection} onBackupDirectionsChange={setBackupDirections} onTargetLocationsChange={setTargetLocations} onApplicationStartChange={setApplicationStart} onHardConstraintsChange={setHardConstraints} onExclusionsChange={setExclusions} onNext={() => {}} />;
}

describe("MFR-031 and MFR-032 goal collection", () => {
  it("collects up to two backup directions and keeps the main direction exclusive", () => {
    render(<GoalsHarness />);
    const backupGroup = screen.getByRole("group", { name: /备选方向/ });
    fireEvent.click(within(backupGroup).getByRole("button", { name: "产品/用户运营" }));
    fireEvent.click(within(backupGroup).getByRole("button", { name: "软件研发" }));
    expect(screen.getByText(/已选 2\/2/)).toBeInTheDocument();
    expect(within(backupGroup).getByRole("button", { name: "市场/品牌/增长" })).toBeDisabled();
    expect(within(backupGroup).getByRole("button", { name: "产品经理" })).toBeDisabled();
    fireEvent.click(within(backupGroup).getByRole("button", { name: "软件研发" }));
    expect(screen.getByText(/已选 1\/2/)).toBeInTheDocument();
  });

  it("updates city, start time, hard constraints and local exclusion fields", () => {
    render(<GoalsHarness />);
    fireEvent.click(screen.getByRole("button", { name: "北京" }));
    expect(screen.getByRole("button", { name: "北京" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "立即开始" }));
    expect(screen.getByRole("button", { name: "立即开始" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("求职硬约束"), { target: { value: "每周至少到岗四天" } });
    fireEvent.change(screen.getByLabelText("排除公司"), { target: { value: "华为" } });
    fireEvent.change(screen.getByLabelText("排除城市"), { target: { value: "深圳" } });
    fireEvent.change(screen.getByLabelText("排除行业"), { target: { value: "金融" } });
    expect(screen.getByLabelText("求职硬约束")).toHaveValue("每周至少到岗四天");
    expect(screen.getByLabelText("排除公司")).toHaveValue("华为");
    expect(screen.getByLabelText("排除城市")).toHaveValue("深圳");
    expect(screen.getByLabelText("排除行业")).toHaveValue("金融");
  });
});
