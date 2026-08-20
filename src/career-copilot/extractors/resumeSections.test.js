import { describe, expect, it } from "vitest";
import { classifyHeading, segmentResumeText, splitSectionEntries } from "./resumeSections.js";

describe("resume section rules", () => {
  it.each([
    ["教育经历", "education"],
    ["2. 实习经历：", "internship"],
    ["PROJECT EXPERIENCE", "project"],
    ["技能", "skill"],
    ["荣誉奖项", "achievement"],
  ])("maps %s to %s", (heading, category) => {
    expect(classifyHeading(heading)).toBe(category);
  });

  it("segments explicit sections with source offsets", () => {
    const text = "个人简历\n\n教育经历\nMoreThan 大学 | 本科 | 2023-2027\n\n项目经历\n增长分析项目 | 2024.03-2024.06\n负责数据分析";
    const sections = segmentResumeText(text);
    expect(sections.map((section) => section.category)).toEqual(["education", "project"]);
    expect(text.slice(sections[0].startOffset, sections[0].endOffset)).toContain("MoreThan 大学");
    expect(sections[0]).toMatchObject({ heading: "教育经历", source: "heading" });
  });

  it("splits multiple dated entries inside one section", () => {
    const text = "实习经历\n甲公司 | 产品实习生 | 2023.06-2023.09\n负责调研\n乙公司 | 运营实习生 | 2024.01-2024.04\n负责复盘";
    const section = segmentResumeText(text)[0];
    const entries = splitSectionEntries(text, section);
    expect(entries).toHaveLength(2);
    expect(text.slice(entries[1].startOffset, entries[1].endOffset)).toContain("乙公司");
  });

  it("infers an unheaded education block conservatively", () => {
    const text = "MoreThan 大学 | 信息管理本科 | 2023-2027\nGPA 3.8/4.0";
    expect(segmentResumeText(text)[0]).toMatchObject({ category: "education", source: "inferred", heading: null });
  });
});
