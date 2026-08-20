import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareCareerDataRelease, publishCareerData, reviewCareerDataRelease } from "../../../scripts/career-data-maintenance.js";

const roots = [];
const PROJECT_DATA = resolve(process.cwd(), "public", "data", "career-copilot");

async function workspace() {
  const root = await mkdtemp(resolve(tmpdir(), "morethan-career-data-"));
  roots.push(root);
  const dataDirectory = resolve(root, "public", "data", "career-copilot");
  await mkdir(dataDirectory, { recursive: true });
  for (const file of ["company-role-pool.json", "source-whitelist.json", "role-family-map.json"]) await writeFile(resolve(dataDirectory, file), await readFile(resolve(PROJECT_DATA, file)));
  return root;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("M5-07 local advisor maintenance workflow", () => {
  it("prepares an isolated editable draft without touching production data", async () => {
    const root = await workspace();
    const before = await readFile(resolve(root, "public/data/career-copilot/company-role-pool.json"), "utf8");
    const result = await prepareCareerDataRelease({ projectRoot: root, releaseId: "release-2026-08-14", editor: "编辑顾问", asOfDate: "2026-08-14", now: new Date("2026-08-14T02:00:00Z") });
    expect(result.manifest.status).toBe("draft");
    expect(await readFile(resolve(result.draftDirectory, "company-role-pool.json"), "utf8")).toBe(before);
    expect(await readFile(resolve(root, "public/data/career-copilot/company-role-pool.json"), "utf8")).toBe(before);
  });

  it("requires explicit checklist confirmation and two independent reviews", async () => {
    const root = await workspace();
    await prepareCareerDataRelease({ projectRoot: root, releaseId: "release-2026-08-14", editor: "编辑顾问", asOfDate: "2026-08-14", now: new Date("2026-08-14T02:00:00Z") });
    await expect(reviewCareerDataRelease({ projectRoot: root, releaseId: "release-2026-08-14", reviewer: "复核甲", confirmAll: false, asOfDate: "2026-08-14" })).rejects.toMatchObject({ code: "REVIEW_CONFIRMATION_REQUIRED" });
    const first = await reviewCareerDataRelease({ projectRoot: root, releaseId: "release-2026-08-14", reviewer: "复核甲", confirmAll: true, asOfDate: "2026-08-14", now: new Date("2026-08-14T03:00:00Z") });
    const second = await reviewCareerDataRelease({ projectRoot: root, releaseId: "release-2026-08-14", reviewer: "复核乙", confirmAll: true, asOfDate: "2026-08-14", now: new Date("2026-08-14T04:00:00Z") });
    expect(first.manifest.status).toBe("in_review");
    expect(second.manifest.status).toBe("approved");
  });

  it("blocks publication when files change after review", async () => {
    const root = await workspace();
    const prepared = await prepareCareerDataRelease({ projectRoot: root, releaseId: "release-2026-08-14", editor: "编辑顾问", asOfDate: "2026-08-14", now: new Date("2026-08-14T02:00:00Z") });
    await reviewCareerDataRelease({ projectRoot: root, releaseId: "release-2026-08-14", reviewer: "复核甲", confirmAll: true, asOfDate: "2026-08-14", now: new Date("2026-08-14T03:00:00Z") });
    await reviewCareerDataRelease({ projectRoot: root, releaseId: "release-2026-08-14", reviewer: "复核乙", confirmAll: true, asOfDate: "2026-08-14", now: new Date("2026-08-14T04:00:00Z") });
    const path = resolve(prepared.draftDirectory, "company-role-pool.json");
    await writeFile(path, `${await readFile(path, "utf8")} `);
    await expect(publishCareerData({ projectRoot: root, releaseId: "release-2026-08-14", publisher: "发布人", confirmPublish: true, now: new Date("2026-08-14T05:00:00Z") })).rejects.toMatchObject({ code: "FILES_CHANGED_AFTER_REVIEW" });
  });

  it("backs up production, publishes reviewed files and writes an audit record", async () => {
    const root = await workspace();
    await prepareCareerDataRelease({ projectRoot: root, releaseId: "release-2026-08-14", editor: "编辑顾问", asOfDate: "2026-08-14", now: new Date("2026-08-14T02:00:00Z") });
    await reviewCareerDataRelease({ projectRoot: root, releaseId: "release-2026-08-14", reviewer: "复核甲", confirmAll: true, asOfDate: "2026-08-14", now: new Date("2026-08-14T03:00:00Z") });
    await reviewCareerDataRelease({ projectRoot: root, releaseId: "release-2026-08-14", reviewer: "复核乙", confirmAll: true, asOfDate: "2026-08-14", now: new Date("2026-08-14T04:00:00Z") });
    let buildVerified = false;
    const result = await publishCareerData({ projectRoot: root, releaseId: "release-2026-08-14", publisher: "发布人", confirmPublish: true, now: new Date("2026-08-14T05:00:00Z"), verifyBuild: async () => { buildVerified = true; } });
    expect(buildVerified).toBe(true);
    expect(result.manifest.status).toBe("published");
    expect(JSON.parse(await readFile(result.auditPath, "utf8"))).toMatchObject({ status: "published", publication: { publisher: "发布人" } });
    expect(JSON.parse(await readFile(resolve(result.backupDirectory, "company-role-pool.json"), "utf8"))).toHaveProperty("datasetVersion");
  });

  it("restores production and withholds the audit record when project checks fail", async () => {
    const root = await workspace();
    const original = await readFile(resolve(root, "public/data/career-copilot/company-role-pool.json"), "utf8");
    const prepared = await prepareCareerDataRelease({ projectRoot: root, releaseId: "release-2026-08-14", editor: "编辑顾问", asOfDate: "2026-08-14", now: new Date("2026-08-14T02:00:00Z") });
    const draftPoolPath = resolve(prepared.draftDirectory, "company-role-pool.json");
    const changedPool = JSON.parse(await readFile(draftPoolPath, "utf8"));
    changedPool.disclaimer = `${changedPool.disclaimer} 已复核。`;
    await writeFile(draftPoolPath, `${JSON.stringify(changedPool, null, 2)}\n`);
    const manifestPath = resolve(prepared.releaseDirectory, "release-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const { createHash } = await import("node:crypto");
    manifest.dataFiles.find(({ key }) => key === "companyRolePool").sha256 = createHash("sha256").update(await readFile(draftPoolPath)).digest("hex");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await reviewCareerDataRelease({ projectRoot: root, releaseId: "release-2026-08-14", reviewer: "复核甲", confirmAll: true, asOfDate: "2026-08-14", now: new Date("2026-08-14T03:00:00Z") });
    await reviewCareerDataRelease({ projectRoot: root, releaseId: "release-2026-08-14", reviewer: "复核乙", confirmAll: true, asOfDate: "2026-08-14", now: new Date("2026-08-14T04:00:00Z") });
    await expect(publishCareerData({ projectRoot: root, releaseId: "release-2026-08-14", publisher: "发布人", confirmPublish: true, now: new Date("2026-08-14T05:00:00Z"), verifyBuild: async () => { throw new Error("test build failed"); } })).rejects.toMatchObject({ code: "BUILD_VALIDATION_FAILED" });
    expect(await readFile(resolve(root, "public/data/career-copilot/company-role-pool.json"), "utf8")).toBe(original);
    await expect(readFile(resolve(root, "docs/career-copilot/MVP前端版/发布记录/release-2026-08-14.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
