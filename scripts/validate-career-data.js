import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateCareerKnowledgeBuild } from "../src/career-copilot/domain/careerKnowledgeBuildValidation.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const asOfArgument = process.argv.find((argument) => argument.startsWith("--as-of="));
const asOfDate = asOfArgument?.slice("--as-of=".length) || process.env.CAREER_KB_AS_OF;

const paths = {
  companyRolePool: resolve(projectRoot, "public/data/career-copilot/company-role-pool.json"),
  sourceWhitelist: resolve(projectRoot, "public/data/career-copilot/source-whitelist.json"),
  roleFamilyMap: resolve(projectRoot, "public/data/career-copilot/role-family-map.json"),
};

try {
  const files = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, JSON.parse(await readFile(path, "utf8"))])));
  const validation = validateCareerKnowledgeBuild(/** @type {any} */ (files), asOfDate ? { asOfDate } : {});
  if (validation.warnings.length) {
    console.warn(`求职助手静态数据有 ${validation.warnings.length} 项时效提醒（运行时将降级展示）：`);
    const warningCounts = new Map();
    validation.warnings.forEach((warning) => {
      const key = `[${warning.dataset}] ${warning.code}`;
      warningCounts.set(key, (warningCounts.get(key) ?? 0) + 1);
    });
    warningCounts.forEach((count, key) => console.warn(`- ${key}: ${count} 项`));
  }
  if (!validation.valid) {
    console.error(`求职助手静态数据校验失败（验收日期 ${validation.asOfDate}）：`);
    validation.errors.forEach((error) => console.error(`- [${error.dataset}] ${error.code} ${error.path}: ${error.message}`));
    process.exitCode = 1;
  } else {
    const summary = validation.summary;
    console.log(`求职助手静态数据校验通过（${validation.asOfDate}）：${summary.companies} 家公司、${summary.companyRoleRecords} 条目标记录、${summary.whitelistedSources} 个白名单来源、${summary.directions} 个方向、${summary.detailedRoleFamilies} 个细分岗位族。`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`求职助手静态数据读取失败：${message}`);
  process.exitCode = 1;
}
