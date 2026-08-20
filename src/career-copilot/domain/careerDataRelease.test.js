import { describe, expect, it } from "vitest";
import {
  approveCareerDataRelease,
  CAREER_DATA_RELEASE_CHECKS,
  createCareerDataRelease,
  publishCareerDataRelease,
  validateCareerDataRelease,
} from "./careerDataRelease.js";

const HASHES = [
  { key: "companyRolePool", fileName: "company-role-pool.json", sha256: "a".repeat(64) },
  { key: "sourceWhitelist", fileName: "source-whitelist.json", sha256: "b".repeat(64) },
  { key: "roleFamilyMap", fileName: "role-family-map.json", sha256: "c".repeat(64) },
];
const NOW = "2026-08-14T02:00:00.000Z";

function draft() {
  return createCareerDataRelease({ releaseId: "release-2026-08-14", editor: "编辑顾问", asOfDate: "2026-08-14", createdAt: NOW, dataFiles: HASHES });
}

function approve(manifest, reviewer, offset) {
  return approveCareerDataRelease(manifest, { reviewer, reviewedAt: `2026-08-14T0${offset}:00:00.000Z`, validationCheckedAt: `2026-08-14T0${offset}:00:00.000Z`, checks: [...CAREER_DATA_RELEASE_CHECKS], dataFiles: HASHES });
}

describe("M5-07 career data release manifest", () => {
  it("creates a valid draft with three immutable data hashes", () => {
    const manifest = draft();
    expect(validateCareerDataRelease(manifest)).toEqual({ valid: true, errors: [] });
    expect(manifest).toMatchObject({ status: "draft", editor: { name: "编辑顾问" }, validation: { status: "pending" } });
    expect(manifest.dataFiles).toHaveLength(3);
  });

  it("requires two different reviewers who are not the editor", () => {
    expect(() => approve(draft(), "编辑顾问", 3)).toThrow(/EDITOR_CANNOT_REVIEW/);
    const first = approve(draft(), "复核顾问甲", 3);
    expect(first.status).toBe("in_review");
    expect(() => approve(first, "复核顾问甲", 4)).toThrow(/REVIEWER_DUPLICATE/);
    const second = approve(first, "复核顾问乙", 4);
    expect(second).toMatchObject({ status: "approved", validation: { status: "passed", errorCount: 0 } });
  });

  it("requires the complete six-point checklist", () => {
    expect(() => approveCareerDataRelease(draft(), { reviewer: "复核顾问甲", reviewedAt: NOW, validationCheckedAt: NOW, checks: CAREER_DATA_RELEASE_CHECKS.slice(0, 5), dataFiles: HASHES })).toThrow(/REVIEW_CHECKLIST_INCOMPLETE/);
  });

  it("rejects file changes before review or after approval", () => {
    const changed = structuredClone(HASHES);
    changed[0].sha256 = "d".repeat(64);
    expect(() => approveCareerDataRelease(draft(), { reviewer: "复核顾问甲", reviewedAt: NOW, validationCheckedAt: NOW, checks: [...CAREER_DATA_RELEASE_CHECKS], dataFiles: changed })).toThrow(/FILES_CHANGED_BEFORE_REVIEW/);
    const approved = approve(approve(draft(), "复核顾问甲", 3), "复核顾问乙", 4);
    expect(() => publishCareerDataRelease(approved, { publisher: "发布人", publishedAt: NOW, backupDirectory: "backup", dataFiles: changed })).toThrow(/FILES_CHANGED_AFTER_REVIEW/);
  });

  it("forbids publishing before both approvals", () => {
    expect(() => publishCareerDataRelease(approve(draft(), "复核顾问甲", 3), { publisher: "发布人", publishedAt: NOW, backupDirectory: "backup", dataFiles: HASHES })).toThrow(/RELEASE_NOT_APPROVED/);
  });

  it("records publisher, backup and final hashes on publication", () => {
    const approved = approve(approve(draft(), "复核顾问甲", 3), "复核顾问乙", 4);
    const published = publishCareerDataRelease(approved, { publisher: "发布人", publishedAt: "2026-08-14T05:00:00.000Z", backupDirectory: "work/career-data/releases/release/backups/one", dataFiles: HASHES });
    expect(validateCareerDataRelease(published)).toEqual({ valid: true, errors: [] });
    expect(published).toMatchObject({ status: "published", publication: { publisher: "发布人", backupDirectory: "work/career-data/releases/release/backups/one" } });
  });

  it("uses a closed schema for audit records", () => {
    const invalid = draft();
    invalid.accountId = "user-1";
    expect(validateCareerDataRelease(invalid).errors).toContainEqual({ code: "ROOT_KEY_UNKNOWN", path: "$.accountId" });
  });

  it("detects manual hash edits inside approved audit records", () => {
    const approved = approve(approve(draft(), "复核顾问甲", 3), "复核顾问乙", 4);
    approved.reviews[0].dataFileHashes[0].sha256 = "f".repeat(64);
    expect(validateCareerDataRelease(approved).errors).toContainEqual({ code: "REVIEW_HASH_MISMATCH", path: "$.reviews[0].dataFileHashes" });
  });
});
