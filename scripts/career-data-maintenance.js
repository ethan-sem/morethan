import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateCareerKnowledgeBuild } from "../src/career-copilot/domain/careerKnowledgeBuildValidation.js";
import {
  approveCareerDataRelease,
  CAREER_DATA_RELEASE_CHECKS,
  createCareerDataRelease,
  publishCareerDataRelease,
} from "../src/career-copilot/domain/careerDataRelease.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = resolve(scriptDirectory, "..");
const FILES = Object.freeze([
  { key: "companyRolePool", fileName: "company-role-pool.json" },
  { key: "sourceWhitelist", fileName: "source-whitelist.json" },
  { key: "roleFamilyMap", fileName: "role-family-map.json" },
]);

/** @param {{ projectRoot?: string, releaseId: string, editor: string, asOfDate?: string, now?: Date }} input */
export async function prepareCareerDataRelease(input) {
  const context = releaseContext(input.projectRoot ?? defaultProjectRoot, input.releaseId);
  await assertMissing(context.manifestPath, "RELEASE_ALREADY_EXISTS");
  await mkdir(context.draftDirectory, { recursive: true });
  for (const file of FILES) await copyFile(resolve(context.productionDirectory, file.fileName), resolve(context.draftDirectory, file.fileName));
  const now = input.now ?? new Date();
  const manifest = createCareerDataRelease({
    releaseId: input.releaseId,
    editor: input.editor,
    asOfDate: input.asOfDate ?? chinaDate(now),
    createdAt: now.toISOString(),
    dataFiles: await hashDataFiles(context.draftDirectory),
  });
  await writeJson(context.manifestPath, manifest);
  return { manifest, releaseDirectory: context.releaseDirectory, draftDirectory: context.draftDirectory };
}

/** @param {{ projectRoot?: string, releaseId: string, reviewer: string, confirmAll: boolean, asOfDate?: string, now?: Date }} input */
export async function reviewCareerDataRelease(input) {
  if (!input.confirmAll) throw workflowError("REVIEW_CONFIRMATION_REQUIRED");
  const context = releaseContext(input.projectRoot ?? defaultProjectRoot, input.releaseId);
  const manifest = await readJson(context.manifestPath);
  const files = await readDataFiles(context.draftDirectory);
  const asOfDate = input.asOfDate ?? chinaDate(input.now ?? new Date());
  const validation = validateCareerKnowledgeBuild(files, { asOfDate });
  if (!validation.valid) throw workflowError("DATA_VALIDATION_FAILED", validation.errors);
  const now = input.now ?? new Date();
  const approved = approveCareerDataRelease(manifest, {
    reviewer: input.reviewer,
    reviewedAt: now.toISOString(),
    validationCheckedAt: now.toISOString(),
    checks: [...CAREER_DATA_RELEASE_CHECKS],
    dataFiles: await hashDataFiles(context.draftDirectory),
  });
  await writeJson(context.manifestPath, approved);
  return { manifest: approved, validation };
}

/** @param {{ projectRoot?: string, releaseId: string, publisher: string, confirmPublish: boolean, now?: Date, verifyBuild?: () => Promise<void> }} input */
export async function publishCareerData(input) {
  if (!input.confirmPublish) throw workflowError("PUBLISH_CONFIRMATION_REQUIRED");
  const context = releaseContext(input.projectRoot ?? defaultProjectRoot, input.releaseId);
  const manifest = await readJson(context.manifestPath);
  const now = input.now ?? new Date();
  const asOfDate = chinaDate(now);
  const files = await readDataFiles(context.draftDirectory);
  const validation = validateCareerKnowledgeBuild(files, { asOfDate });
  if (!validation.valid) throw workflowError("DATA_VALIDATION_FAILED", validation.errors);
  const hashes = await hashDataFiles(context.draftDirectory);
  const backupDirectory = resolve(context.releaseDirectory, "backups", safeTimestamp(now));
  const published = publishCareerDataRelease(manifest, {
    publisher: input.publisher,
    publishedAt: now.toISOString(),
    backupDirectory: relativeAuditPath(context.projectRoot, backupDirectory),
    dataFiles: hashes,
  });
  await mkdir(backupDirectory, { recursive: true });
  for (const file of FILES) await copyFile(resolve(context.productionDirectory, file.fileName), resolve(backupDirectory, file.fileName));

  const copied = [];
  try {
    for (const file of FILES) {
      await copyFile(resolve(context.draftDirectory, file.fileName), resolve(context.productionDirectory, file.fileName));
      copied.push(file.fileName);
    }
    if (input.verifyBuild) await input.verifyBuild();
  } catch (error) {
    for (const fileName of copied) await copyFile(resolve(backupDirectory, fileName), resolve(context.productionDirectory, fileName));
    if (input.verifyBuild) throw workflowError("BUILD_VALIDATION_FAILED", [error]);
    throw error;
  }
  await writeJson(context.manifestPath, published);
  await mkdir(context.auditDirectory, { recursive: true });
  const auditPath = resolve(context.auditDirectory, `${input.releaseId}.json`);
  await writeJson(auditPath, published);
  return { manifest: published, validation, backupDirectory, auditPath };
}

/** @param {string} projectRoot @param {string} releaseId */
function releaseContext(projectRoot, releaseId) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(releaseId)) throw workflowError("RELEASE_ID_INVALID");
  const root = resolve(projectRoot);
  const maintenanceRoot = resolve(root, "work", "career-data");
  const releaseDirectory = resolve(maintenanceRoot, "releases", releaseId);
  if (!releaseDirectory.startsWith(resolve(maintenanceRoot, "releases") + "\\") && releaseDirectory !== resolve(maintenanceRoot, "releases")) throw workflowError("RELEASE_PATH_INVALID");
  return {
    projectRoot: root,
    productionDirectory: resolve(root, "public", "data", "career-copilot"),
    releaseDirectory,
    draftDirectory: resolve(releaseDirectory, "draft"),
    manifestPath: resolve(releaseDirectory, "release-manifest.json"),
    auditDirectory: resolve(root, "docs", "career-copilot", "MVP前端版", "发布记录"),
  };
}

/** @param {string} directory */
async function readDataFiles(directory) {
  const values = await Promise.all(FILES.map(async (file) => [file.key, JSON.parse(await readFile(resolve(directory, file.fileName), "utf8"))]));
  return Object.fromEntries(values);
}

/** @param {string} directory */
async function hashDataFiles(directory) {
  return Promise.all(FILES.map(async (file) => ({ key: file.key, fileName: file.fileName, sha256: createHash("sha256").update(await readFile(resolve(directory, file.fileName))).digest("hex") })));
}

/** @param {string} path */
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
/** @param {string} path @param {unknown} value */
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
/** @param {string} path @param {string} code */
async function assertMissing(path, code) { try { await access(path); throw workflowError(code); } catch (error) { if (error?.code !== "ENOENT") throw error; } }
/** @param {Date} value */
function chinaDate(value) { const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value); const values = Object.fromEntries(parts.map(({ type, value: item }) => [type, item])); return `${values.year}-${values.month}-${values.day}`; }
/** @param {Date} value */
function safeTimestamp(value) { return value.toISOString().replaceAll(":", "-").replace(".", "-"); }
/** @param {string} projectRoot @param {string} path */
function relativeAuditPath(projectRoot, path) { return path.slice(resolve(projectRoot).length + 1).replaceAll("\\", "/"); }
/** @param {string} code @param {unknown[]=} details */
function workflowError(code, details = []) { const error = new Error(code); error.code = code; error.details = details; return error; }

async function main() {
  const [command] = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  const args = Object.fromEntries(process.argv.slice(2).filter((argument) => argument.startsWith("--") && argument.includes("=")).map((argument) => { const index = argument.indexOf("="); return [argument.slice(2, index), argument.slice(index + 1)]; }));
  const flags = new Set(process.argv.slice(2).filter((argument) => argument.startsWith("--") && !argument.includes("=")));
  if (command === "prepare") {
    const result = await prepareCareerDataRelease({ releaseId: requiredArg(args, "release"), editor: requiredArg(args, "editor"), asOfDate: args["as-of"] });
    console.log(`维护草稿已创建：${result.releaseDirectory}`);
  } else if (command === "review") {
    const result = await reviewCareerDataRelease({ releaseId: requiredArg(args, "release"), reviewer: requiredArg(args, "reviewer"), confirmAll: flags.has("--confirm-all"), asOfDate: args["as-of"] });
    console.log(`复核已记录：${result.manifest.reviews.length}/2，状态 ${result.manifest.status}`);
  } else if (command === "publish") {
    const result = await publishCareerData({ releaseId: requiredArg(args, "release"), publisher: requiredArg(args, "publisher"), confirmPublish: flags.has("--confirm-publish"), verifyBuild: () => runProjectCheck(defaultProjectRoot) });
    console.log(`数据已发布并留档：${result.auditPath}`);
  } else {
    throw workflowError("COMMAND_INVALID");
  }
}

/** @param {Record<string, string>} args @param {string} key */
function requiredArg(args, key) { if (!args[key]?.trim()) throw workflowError(`ARG_${key.toUpperCase().replaceAll("-", "_")}_REQUIRED`); return args[key].trim(); }

/** @param {string} projectRoot */
function runProjectCheck(projectRoot) {
  const runner = process.env.npm_execpath;
  if (!runner) return Promise.reject(workflowError("PACKAGE_RUNNER_UNAVAILABLE"));
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [runner, "run", "check"], { cwd: projectRoot, stdio: "inherit", env: process.env });
    child.on("error", rejectPromise);
    child.on("exit", (code) => code === 0 ? resolvePromise() : rejectPromise(workflowError("PROJECT_CHECK_FAILED")));
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) main().catch((error) => { console.error(`顾问数据维护失败：${error.code ?? error.message}`); if (Array.isArray(error.details)) error.details.slice(0, 20).forEach((detail) => console.error(`- ${detail.dataset ?? "workflow"} ${detail.code ?? "ERROR"} ${detail.path ?? ""}`)); process.exitCode = 1; });
