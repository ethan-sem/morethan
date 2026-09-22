import { brotliCompressSync, gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const manifestPath = join(dist, ".vite", "manifest.json");
const reportPath = resolve(root, process.env.PERF_BUDGET_REPORT_PATH || "outputs/career-copilot/m7-05-performance-budget.json");
const scale = Number(process.env.PERF_BUDGET_SCALE || 1);

if (!Number.isFinite(scale) || scale <= 0) fail("PERF_BUDGET_SCALE 必须是正数");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const homeKey = "index.html";
const careerKey = "src/careerCopilot.jsx";
if (!manifest[homeKey]?.isEntry || !manifest[careerKey]?.isDynamicEntry) fail("构建 manifest 缺少首页或求职助手入口");

const measurements = new Map();
function measure(file) {
  const normalized = file.replaceAll("\\", "/");
  if (measurements.has(normalized)) return measurements.get(normalized);
  const content = readFileSync(join(dist, normalized));
  const value = { file: normalized, raw: content.length, gzip: gzipSync(content, { level: 9 }).length, brotli: brotliCompressSync(content).length };
  measurements.set(normalized, value);
  return value;
}

function staticClosure(startKey) {
  const seen = new Set();
  function visit(key) {
    if (seen.has(key)) return;
    const item = manifest[key];
    if (!item) fail(`manifest 引用了不存在的模块：${key}`);
    seen.add(key);
    for (const imported of item.imports || []) visit(imported);
  }
  visit(startKey);
  return seen;
}

function filesForKeys(keys) {
  return [...keys].map((key) => measure(manifest[key].file));
}

function sum(items, field) { return items.reduce((total, item) => total + item[field], 0); }
function summary(items) { return { raw: sum(items, "raw"), gzip: sum(items, "gzip"), brotli: sum(items, "brotli"), files: items }; }
function walk(folder) {
  if (!statSync(folder).isDirectory()) return [folder];
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => walk(join(folder, entry.name)));
}

const homeKeys = staticClosure(homeKey);
const careerKeys = staticClosure(careerKey);
const careerAdditionalKeys = new Set([...careerKeys].filter((key) => !homeKeys.has(key)));
const homeJs = summary(filesForKeys(homeKeys));
const careerJs = summary(filesForKeys(careerAdditionalKeys));
const homeCss = summary((manifest[homeKey].css || []).map(measure));
const careerCss = summary((manifest[careerKey].css || []).map(measure));

const directionFolder = join(dist, "data", "career-copilot", "by-direction");
const companySlices = walk(directionFolder).filter((file) => file.endsWith(".json")).map((file) => measure(relative(dist, file)));
const allAssets = walk(join(dist, "assets")).map((file) => measure(relative(dist, file)));
const parserAllowlist = [
  /^docxParser\.worker-[\w-]+\.js$/,
  /^pdfParser\.worker-[\w-]+\.js$/,
  /^pdf\.worker\.min-[\w-]+\.mjs$/,
  /^txtParser\.worker-[\w-]+\.js$/,
  /^resumeFactsExtractor\.worker-[\w-]+\.js$/,
];
const isParser = (file) => parserAllowlist.some((pattern) => pattern.test(basename(file)));
const businessChunks = allAssets.filter((item) => /\.(?:js|mjs)$/.test(item.file) && !isParser(item.file));
const images = walk(dist).filter((file) => /\.(?:avif|gif|jpe?g|png|webp)$/i.test(file)).map((file) => measure(relative(dist, file)));
const firstScreenImagePaths = ["assets/edutoro-logo-mark.svg", "assets/edutoro-logo-source.png"];
const firstScreenImages = firstScreenImagePaths.map(measure);

const limits = {
  homeJs: { target: 180_000, hard: 200_000 },
  homeCss: { target: 35_000, hard: 45_000 },
  careerJs: { target: 140_000, hard: 170_000 },
  careerCss: { target: 25_000, hard: 35_000 },
  companySlice: { target: 60_000, hard: 80_000 },
  businessChunk: { target: 100_000, hard: 120_000 },
  image: { target: 250_000, hard: 350_000 },
};

const checks = [];
function check(id, label, actual, budget, unit = "gzip bytes") {
  const hard = Math.floor(budget.hard * scale);
  checks.push({ id, label, actual, target: budget.target, hard, unit, targetPassed: actual <= budget.target, passed: actual <= hard, margin: hard - actual });
}
check("home-js", "官网初始 JavaScript", homeJs.gzip, limits.homeJs);
check("home-css", "官网初始 CSS", homeCss.gzip, limits.homeCss);
check("career-js", "助手首次进入附加 JavaScript", careerJs.gzip, limits.careerJs);
check("career-css", "助手首次进入附加 CSS", careerCss.gzip, limits.careerCss);
for (const item of companySlices) check(`company:${item.file}`, `方向公司数据 ${basename(item.file)}`, item.gzip, limits.companySlice);
for (const item of businessChunks) check(`chunk:${item.file}`, `业务 chunk ${basename(item.file)}`, item.gzip, limits.businessChunk);
for (const item of firstScreenImages) check(`image:${item.file}`, `首屏图片 ${basename(item.file)}`, item.raw, limits.image, "raw bytes");

const homeCode = homeJs.files.map((item) => readFileSync(join(dist, item.file), "utf8")).join("\n");
const boundaryChecks = [
  { id: "home-no-career-static", passed: !homeKeys.has(careerKey), detail: "首页静态依赖闭包不含求职助手入口" },
  { id: "home-no-parser", passed: !/pdfjs-dist|mammoth|pdfParser\.worker|docxParser\.worker/.test(homeCode), detail: "首页初始代码不含 PDF.js/Mammoth/解析 Worker" },
  { id: "home-no-company-pool", passed: !/company-role-pool|by-direction/.test(homeCode), detail: "首页初始代码不含公司岗位池" },
  { id: "parser-exact-allowlist", passed: allAssets.filter((item) => /(?:Parser|Extractor)\.worker-|pdf\.worker\.min-/.test(basename(item.file))).every((item) => isParser(item.file)), detail: "解析 Worker 仅通过精确文件名白名单识别" },
];

const failures = [...checks.filter((item) => !item.passed).map((item) => `${item.label}: ${item.actual} > ${item.hard} ${item.unit}`), ...boundaryChecks.filter((item) => !item.passed).map((item) => item.detail)];
const report = {
  schemaVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  scale,
  status: failures.length ? "failed" : "passed",
  entries: { homeJs, homeCss, careerAdditionalJs: careerJs, careerCss },
  companyData: { selectedSliceMaxGzip: Math.max(...companySlices.map((item) => item.gzip)), aggregateGzip: sum(companySlices, "gzip"), files: companySlices },
  parserAssets: allAssets.filter((item) => isParser(item.file)),
  images: { firstScreen: firstScreenImages, inventory: images },
  checks,
  boundaryChecks,
  failures,
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

for (const item of checks.filter((entry) => ["home-js", "home-css", "career-js", "career-css"].includes(entry.id))) {
  console.log(`${item.passed ? "PASS" : "FAIL"} ${item.label}: ${(item.actual / 1000).toFixed(2)}KB / ${(item.hard / 1000).toFixed(2)}KB（gzip）`);
}
console.log(`PASS 公司方向数据最大 gzip: ${(report.companyData.selectedSliceMaxGzip / 1000).toFixed(2)}KB`);
console.log(`资源明细：${relative(root, reportPath)}`);
if (failures.length) fail(`性能预算未通过\n- ${failures.join("\n- ")}`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
