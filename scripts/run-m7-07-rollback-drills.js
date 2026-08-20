import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const evidenceRoot = resolve(root, "outputs", "career-copilot", "m7-07");
const packageRoot = resolve(evidenceRoot, "packages");
const vite = resolve(root, "node_modules", "vite", "bin", "vite.js");
const drills = [
  {
    id: "entry-rollback",
    output: resolve(packageRoot, "entry-disabled"),
    env: { VITE_COPILOT_ENABLED: "false", VITE_COPILOT_LOCAL_PARSING: "true", VITE_COPILOT_JD_ANALYSIS: "true", VITE_COPILOT_REPORT_PRINTING: "true", VITE_COPILOT_BYOK: "false" },
    expected: "一级入口不可见，#career-copilot 深链退回官网首页，官网其他页面保留。",
  },
  {
    id: "parser-downgrade",
    output: resolve(packageRoot, "local-parsing-disabled"),
    env: { VITE_COPILOT_ENABLED: "true", VITE_COPILOT_LOCAL_PARSING: "false", VITE_COPILOT_JD_ANALYSIS: "true", VITE_COPILOT_REPORT_PRINTING: "true", VITE_COPILOT_BYOK: "false" },
    expected: "助手入口保留，文件选择禁用，粘贴与手工填写继续可用。",
  },
];

await mkdir(packageRoot, { recursive: true });
const results = [];
for (const drill of drills) {
  assertInside(packageRoot, drill.output);
  await rm(drill.output, { recursive: true, force: true });
  const startedAt = new Date();
  const run = spawnSync(process.execPath, [vite, "build", "--outDir", drill.output, "--emptyOutDir"], {
    cwd: root,
    env: { ...process.env, ...drill.env },
    encoding: "utf8",
  });
  if (run.status !== 0) {
    process.stderr.write(run.stdout ?? "");
    process.stderr.write(run.stderr ?? "");
    process.exit(run.status ?? 1);
  }
  const files = await hashDirectory(drill.output);
  results.push({
    id: drill.id,
    status: "build_passed_browser_verification_pending",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    flags: drill.env,
    expected: drill.expected,
    outputDirectory: relative(root, drill.output).replaceAll("\\", "/"),
    aggregateSha256: aggregateHash(files),
    fileCount: files.length,
    files,
  });
}

const evidence = {
  schemaVersion: "1.0.0",
  task: "M7-07",
  environment: "non-production local release-equivalent builds",
  generatedAt: new Date().toISOString(),
  note: "构建通过不等于浏览器演练通过；浏览器验证结果由后续验收记录追加，不在此脚本内伪造。",
  drills: results,
};
const evidencePath = resolve(evidenceRoot, "rollback-builds.json");
await mkdir(dirname(evidencePath), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(`M7-07 rollback builds passed: ${results.map((item) => `${item.id}=${item.aggregateSha256}`).join(", ")}\n`);

function assertInside(parent, target) {
  if (!target.startsWith(`${parent}${sep}`)) throw new Error(`UNSAFE_OUTPUT_PATH:${target}`);
}

async function hashDirectory(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await hashDirectory(target, base));
    else if (entry.isFile()) {
      const bytes = await readFile(target);
      files.push({
        path: relative(base, target).replaceAll("\\", "/"),
        bytes: (await stat(target)).size,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function aggregateHash(files) {
  return createHash("sha256").update(files.map((file) => `${file.path}\0${file.sha256}`).join("\n")).digest("hex");
}
