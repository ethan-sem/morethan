import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
import { extractJdProfile, validateJdProfile } from "../src/career-copilot/domain/jdExtractor.js";
import { validateResumeFacts } from "../src/career-copilot/domain/resumeFacts.js";
import { extractResumeFacts } from "../src/career-copilot/extractors/resumeFactsExtractor.js";
import { detectPrivateFields } from "../src/career-copilot/privacy/piiDetector.js";

const projectRoot = process.cwd();
const fixtureRoot = join(projectRoot, "test-fixtures", "career-copilot");
const manifestPath = join(fixtureRoot, "manifest.json");
const REQUIRED_SCENARIOS = Object.freeze(["blank_input", "cross_major", "limited_experience", "timeline_conflict", "chinese", "english", "bilingual", "dense_contacts", "table_like", "jd_high_match", "jd_low_match", "jd_risk_language"]);
const ALLOWED_ROOT_KEYS = Object.freeze(["schemaVersion", "datasetId", "updatedAt", "disclaimer", "entries"]);
const ALLOWED_ENTRY_KEYS = Object.freeze(["id", "kind", "file", "language", "scenarios", "expected"]);
const REAL_EMAIL_PATTERN = /@[A-Z0-9.-]+\.(?:com|cn|net|org|edu|io|ai|co)(?:\b|$)/iu;
const CHINESE_ID_PATTERN = /(?<!\d)\d{17}[\dX](?!\d)|(?<!\d)\d{15}(?!\d)/iu;

export function validateCareerFixtureDataset() {
  /** @type {{ code: string, path: string, message: string }[]} */
  const errors = [];
  const manifest = parseManifest(errors);
  if (!manifest) return { valid: false, errors, summary: emptySummary() };
  checkAllowedKeys(manifest, ALLOWED_ROOT_KEYS, "$", errors);
  if (manifest.schemaVersion !== "1.0.0") add(errors, "SCHEMA_VERSION_UNSUPPORTED", "$.schemaVersion", "只接受样本清单 1.0.0。 ");
  if (!Array.isArray(manifest.entries)) add(errors, "ENTRIES_INVALID", "$.entries", "entries 必须为数组。 ");
  if (!Array.isArray(manifest.entries)) return { valid: false, errors, summary: emptySummary() };

  const ids = new Set();
  const files = new Set();
  const coveredScenarios = new Set();
  let resumeCount = 0;
  let jdCount = 0;

  manifest.entries.forEach((entry, index) => {
    const path = `$.entries[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) { add(errors, "ENTRY_INVALID", path, "样本项必须为对象。 "); return; }
    checkAllowedKeys(entry, ALLOWED_ENTRY_KEYS, path, errors);
    if (typeof entry.id !== "string" || !/^[a-z0-9-]+$/u.test(entry.id)) add(errors, "ENTRY_ID_INVALID", `${path}.id`, "ID 只能使用小写字母、数字和连字符。 ");
    else if (ids.has(entry.id)) add(errors, "ENTRY_ID_DUPLICATE", `${path}.id`, "样本 ID 重复。 "); else ids.add(entry.id);
    if (entry.kind !== "resume" && entry.kind !== "jd") add(errors, "ENTRY_KIND_INVALID", `${path}.kind`, "kind 必须是 resume 或 jd。 ");
    if (!Array.isArray(entry.scenarios) || entry.scenarios.some((scenario) => typeof scenario !== "string")) add(errors, "ENTRY_SCENARIOS_INVALID", `${path}.scenarios`, "scenarios 必须是字符串数组。 ");
    else entry.scenarios.forEach((scenario) => coveredScenarios.add(scenario));
    const resolved = resolveFixtureFile(entry.file, path, errors);
    if (!resolved) return;
    if (files.has(resolved)) add(errors, "ENTRY_FILE_DUPLICATE", `${path}.file`, "文件被重复引用。 "); else files.add(resolved);
    let text;
    try { text = readFileSync(resolved, "utf8"); }
    catch { add(errors, "ENTRY_FILE_MISSING", `${path}.file`, "无法读取样本文件。 "); return; }
    validateSyntheticContent(text, entry, path, errors);
    if (entry.kind === "resume") { resumeCount += 1; validateResumeEntry(text, entry, path, errors); }
    if (entry.kind === "jd") { jdCount += 1; validateJdEntry(text, entry, path, errors); }
  });

  REQUIRED_SCENARIOS.filter((scenario) => !coveredScenarios.has(scenario)).forEach((scenario) => add(errors, "SCENARIO_MISSING", "$.entries", `缺少必测场景 ${scenario}。`));
  if (resumeCount < 10) add(errors, "RESUME_COUNT_INSUFFICIENT", "$.entries", "至少需要 10 份简历样本。 ");
  if (jdCount < 6) add(errors, "JD_COUNT_INSUFFICIENT", "$.entries", "至少需要 6 份 JD 样本。 ");
  return { valid: errors.length === 0, errors, summary: { entries: manifest.entries.length, resumes: resumeCount, jds: jdCount, scenarios: coveredScenarios.size } };
}

function parseManifest(errors) {
  try { return JSON.parse(readFileSync(manifestPath, "utf8")); }
  catch { add(errors, "MANIFEST_INVALID", "$", "样本清单不存在或不是合法 JSON。 "); return null; }
}

function resolveFixtureFile(file, path, errors) {
  if (typeof file !== "string" || !file.endsWith(".txt") || isAbsolute(file)) { add(errors, "ENTRY_FILE_INVALID", `${path}.file`, "文件必须是样本目录内的相对 .txt 路径。 "); return null; }
  const resolved = normalize(join(fixtureRoot, file));
  const rel = relative(fixtureRoot, resolved);
  if (rel.startsWith("..") || isAbsolute(rel) || dirname(resolved) === dirname(fixtureRoot)) { add(errors, "ENTRY_FILE_OUTSIDE_ROOT", `${path}.file`, "文件不能离开样本目录。 "); return null; }
  return resolved;
}

function validateSyntheticContent(text, entry, path, errors) {
  const blankExpected = entry.scenarios?.includes("blank_input");
  if (!blankExpected && !text.startsWith("# SYNTHETIC FIXTURE — NOT A REAL PERSON OR JOB")) add(errors, "SYNTHETIC_MARKER_MISSING", `${path}.file`, "非空样本必须带纯虚构标记。 ");
  if (!blankExpected && text.trim().length < 80) add(errors, "FIXTURE_TOO_SHORT", `${path}.file`, "非空样本内容过短。 ");
  if (REAL_EMAIL_PATTERN.test(text)) add(errors, "REAL_EMAIL_DOMAIN_FORBIDDEN", `${path}.file`, "只能使用 example.invalid 测试邮箱。 ");
  if (CHINESE_ID_PATTERN.test(text)) add(errors, "ID_NUMBER_FORBIDDEN", `${path}.file`, "样本中禁止出现身份证格式数字。 ");
  if (/(?:真实姓名|真实简历|真实候选人)\s*[:：]/u.test(text)) add(errors, "REAL_PERSON_MARKER_FORBIDDEN", `${path}.file`, "样本禁止标记真实个人材料。 ");
}

function validateResumeEntry(text, entry, path, errors) {
  const privateFields = detectPrivateFields(text, { documentId: entry.id });
  const facts = extractResumeFacts({ text, documentId: entry.id, format: "txt", characterCount: text.replace(/\s/gu, "").length, privateFields, now: "2026-08-14T00:00:00.000Z" });
  const validation = validateResumeFacts(facts);
  if (!validation.valid) add(errors, "RESUME_FACTS_INVALID", path, validation.errors[0]?.code ?? "ResumeFacts 校验失败。 ");
  const expected = entry.expected ?? {};
  if (facts.facts.length < (expected.minFacts ?? 0)) add(errors, "RESUME_FACTS_INSUFFICIENT", `${path}.expected.minFacts`, `仅提取到 ${facts.facts.length} 条事实。`);
  const categories = new Set(facts.facts.map((fact) => fact.category));
  for (const category of expected.factCategories ?? []) if (!categories.has(category)) add(errors, "RESUME_CATEGORY_MISSING", `${path}.expected.factCategories`, `未提取到 ${category}。`);
  const flagTypes = new Set(facts.timelineFlags.map((flag) => flag.type));
  for (const type of expected.timelineFlagTypes ?? []) if (!flagTypes.has(type)) add(errors, "TIMELINE_FLAG_MISSING", `${path}.expected.timelineFlagTypes`, `未产生 ${type}。`);
  const privateTypes = new Set(privateFields.map((field) => field.type));
  for (const type of expected.privateFieldTypes ?? []) if (!privateTypes.has(type)) add(errors, "PRIVATE_FIELD_TYPE_MISSING", `${path}.expected.privateFieldTypes`, `未识别到 ${type}。`);
}

function validateJdEntry(text, entry, path, errors) {
  const expected = entry.expected ?? {};
  try {
    const profile = extractJdProfile(text, { now: "2026-08-14T00:00:00.000Z" });
    if (expected.errorCode) { add(errors, "JD_ERROR_EXPECTED", `${path}.expected.errorCode`, `预期 ${expected.errorCode}，实际成功。`); return; }
    if (!validateJdProfile(profile).valid) add(errors, "JD_PROFILE_INVALID", path, "JdProfile 校验失败。 ");
    if (profile.responsibilities.length < (expected.minResponsibilities ?? 0)) add(errors, "JD_RESPONSIBILITIES_INSUFFICIENT", path, "职责提取数量不足。 ");
    if (profile.requirements.required.length < (expected.minRequired ?? 0)) add(errors, "JD_REQUIRED_INSUFFICIENT", path, "硬要求提取数量不足。 ");
    if (profile.requirements.preferred.length < (expected.minPreferred ?? 0)) add(errors, "JD_PREFERRED_INSUFFICIENT", path, "加分项提取数量不足。 ");
    const risks = new Set(profile.riskItems.map((item) => item.type));
    for (const type of expected.riskTypes ?? []) if (!risks.has(type)) add(errors, "JD_RISK_MISSING", `${path}.expected.riskTypes`, `未识别到 ${type}。`);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : error instanceof Error ? error.message : "UNKNOWN";
    if (code !== expected.errorCode) add(errors, "JD_UNEXPECTED_ERROR", path, `预期 ${expected.errorCode ?? "成功"}，实际 ${code}。`);
  }
}

function checkAllowedKeys(value, allowedKeys, path, errors) { Object.keys(value).filter((key) => !allowedKeys.includes(key)).forEach((key) => add(errors, "KEY_UNKNOWN", `${path}.${key}`, "存在未声明字段。 ")); }
function add(errors, code, path, message) { errors.push({ code, path, message: message.trim() }); }
function emptySummary() { return { entries: 0, resumes: 0, jds: 0, scenarios: 0 }; }

if (process.argv[1]?.endsWith("validate-career-fixtures.js")) {
  const result = validateCareerFixtureDataset();
  if (!result.valid) {
    console.error(`求职助手匿名样本校验失败：${result.errors.length} 项问题。`);
    result.errors.forEach((error) => console.error(`- [${error.code}] ${error.path}: ${error.message}`));
    process.exit(1);
  }
  console.log(`求职助手匿名样本校验通过：${result.summary.resumes} 份简历、${result.summary.jds} 份 JD、${result.summary.scenarios} 个测试场景。`);
}
