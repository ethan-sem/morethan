import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const script = resolve(import.meta.dirname, "validate-performance-budget.js");
const result = spawnSync(process.execPath, [script], {
  encoding: "utf8",
  env: { ...process.env, PERF_BUDGET_SCALE: "0.01", PERF_BUDGET_REPORT_PATH: "tmp/m7-05-intentional-failure.json" },
});

if (result.status === 0 || !`${result.stdout}\n${result.stderr}`.includes("性能预算未通过")) {
  console.error("性能预算反向测试失败：故意超限没有返回预期的非零状态");
  process.exit(1);
}

console.log("PASS 性能预算反向测试：故意超限返回非零状态");
