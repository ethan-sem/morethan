import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourcePath = join(root, "public", "data", "career-copilot", "company-role-pool.json");
const outputRoot = join(root, "public", "data", "career-copilot");
const slicesRoot = join(outputRoot, "by-direction");
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const directions = {};

mkdirSync(slicesRoot, { recursive: true });
for (const roleFamily of source.roleFamilies) {
  const records = source.records.filter((record) => record.roleFamilyId === roleFamily.id);
  const companyIds = new Set(records.map((record) => record.companyId));
  const entranceIds = new Set(records.flatMap((record) => record.entranceIds));
  const entrances = source.recruitmentEntrances.filter((entrance) => entranceIds.has(entrance.id));
  const sourceIds = new Set([...records.flatMap((record) => record.sourceIds), ...entrances.flatMap((entrance) => entrance.sourceIds)]);
  const slice = {
    schemaVersion: source.schemaVersion,
    datasetVersion: source.datasetVersion,
    status: source.status,
    locale: source.locale,
    publishedAt: source.publishedAt,
    validThrough: source.validThrough,
    disclaimer: source.disclaimer,
    tagDefinitions: source.tagDefinitions,
    companies: source.companies.filter((company) => companyIds.has(company.id)),
    roleFamilies: [roleFamily],
    sources: source.sources.filter((item) => sourceIds.has(item.id)),
    recruitmentEntrances: entrances,
    records,
  };
  const body = `${JSON.stringify(slice, null, 2)}\n`;
  const file = `${roleFamily.id}.json`;
  writeFileSync(join(slicesRoot, file), body, "utf8");
  directions[roleFamily.id] = {
    file: `./by-direction/${file}`,
    rawBytes: Buffer.byteLength(body),
    gzipBytes: gzipSync(body, { level: 9 }).byteLength,
    records: records.length,
  };
}

const index = {
  schemaVersion: "1.0.0",
  datasetVersion: source.datasetVersion,
  publishedAt: source.publishedAt,
  validThrough: source.validThrough,
  directions,
};
const indexPath = join(outputRoot, "company-role-pool-index.json");
mkdirSync(dirname(indexPath), { recursive: true });
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log(`公司岗位池方向切片已生成：${Object.keys(directions).length} 个方向，版本 ${source.datasetVersion}。`);
