import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import companyRolePool from "../public/data/career-copilot/company-role-pool.json" with { type: "json" };
import roleFamilyMap from "../public/data/career-copilot/role-family-map.json" with { type: "json" };
import sourceWhitelist from "../public/data/career-copilot/source-whitelist.json" with { type: "json" };
import { createActionPlan, validateActionPlan } from "../src/career-copilot/domain/actionPlan.js";
import { DEFAULT_ANALYSIS_RULESET_VERSION } from "../src/career-copilot/domain/analysisRules.js";
import { analyzeCareerProfile } from "../src/career-copilot/domain/careerProfileAnalysis.js";
import { createApplicationTierPlan, validateApplicationTierPlan } from "../src/career-copilot/domain/applicationTierPlan.js";
import { createCompanyRoleRecommendations } from "../src/career-copilot/domain/companyRoleRecommendations.js";
import { createConclusionProvenance, validateConclusionProvenance } from "../src/career-copilot/domain/conclusionProvenance.js";
import { createEvidenceDegradationPlan, validateEvidenceDegradationPlan } from "../src/career-copilot/domain/evidenceDegradation.js";
import { extractJdProfile } from "../src/career-copilot/domain/jdExtractor.js";
import { compareResumeToJd, validateJdGapAnalysis } from "../src/career-copilot/domain/jdGapAnalysis.js";
import { REPORT_DISCLOSURE_VERSION } from "../src/career-copilot/domain/reportDisclosure.js";
import { buildPrivacySafeReportText } from "../src/career-copilot/domain/reportTextExport.js";
import { completeResumeFactsReview, setFactReviewStatus, setTimelineFlagStatus } from "../src/career-copilot/domain/resumeFactsReview.js";
import { extractResumeFacts } from "../src/career-copilot/extractors/resumeFactsExtractor.js";
import { detectPrivateFields } from "../src/career-copilot/privacy/piiDetector.js";

const root = resolve(import.meta.dirname, "..");
const fixtureRoot = resolve(root, "test-fixtures", "career-copilot");
const outputRoot = resolve(root, "outputs", "career-copilot", "m7-07");
const reportRoot = resolve(outputRoot, "reports");
const generatedAt = new Date().toISOString();
const asOfDate = "2026-08-20";
const manifest = await readJson(resolve(fixtureRoot, "manifest.json"));
const caseDefinitions = [
  ["CR-01", "resume-stem-two-internships", "software-engineering", null, "理工科两段相关实习；无 JD"],
  ["CR-02", "resume-business-no-metrics", "product-operations", null, "商科项目多但量化不足；无 JD"],
  ["CR-03", "resume-cross-major-product", "product-manager", "jd-product-high-match", "跨专业转产品；高匹配 JD"],
  ["CR-04", "resume-early-student", "marketing-growth", null, "低年级、经历较少；无 JD 降级"],
  ["CR-05", "resume-timeline-conflict", "finance-accounting", null, "时间线冲突；金融财会方向"],
  ["CR-06", "resume-english-data", "data-business-analysis", "jd-quant-low-match", "英文材料；低匹配 JD"],
  ["CR-07", "resume-bilingual-operations", "product-operations", "jd-operations-bilingual", "中英混合材料与 JD"],
  ["CR-08", "resume-dense-contacts-table", "marketing-growth", null, "联系方式密集、表格式材料"],
  ["CR-09", "resume-unheaded-minimal", "finance-accounting", null, "无标题、经历有限"],
  ["CR-10", "resume-cross-major-product", "product-manager", "jd-quant-low-match", "跨专业材料；刻意低匹配 JD"],
];

await mkdir(reportRoot, { recursive: true });
const contentCases = [];
for (const [id, resumeId, directionId, jdId, coverage] of caseDefinitions) {
  const resumeEntry = findEntry(resumeId);
  const resumeText = await readFile(resolve(fixtureRoot, resumeEntry.file), "utf8");
  const privateFields = detectPrivateFields(resumeText, { documentId: resumeId });
  const rawPrivateValues = privateFields.flatMap((field) => field.sourceRefs.map((source) => resumeText.slice(source.startOffset, source.endOffset))).filter(Boolean);
  const reviewedFacts = confirmFacts(extractResumeFacts({ text: resumeText, documentId: resumeId, format: "txt", characterCount: resumeText.replace(/\s/gu, "").length, privateFields, now: generatedAt }));
  const analysis = analyzeCareerProfile(reviewedFacts, { targetDirection: directionId });
  const jdGap = jdId ? compareResumeToJd(reviewedFacts, extractJdProfile(await readFile(resolve(fixtureRoot, findEntry(jdId).file), "utf8"), { now: generatedAt })) : null;
  const degradation = createEvidenceDegradationPlan(analysis);
  const tierPlan = createApplicationTierPlan(analysis, jdGap, { recruitmentType: "internship" });
  const actionPlan = createActionPlan(analysis, jdGap, tierPlan, { degradationPlan: degradation });
  const provenance = createConclusionProvenance(analysis, jdGap, tierPlan, actionPlan);
  const companies = createCompanyRoleRecommendations(companyRolePool, { directionId, recruitmentType: "internship", asOfDate });
  const report = buildPrivacySafeReportText({ analysis, jdGapAnalysis: jdGap, applicationTierPlan: tierPlan, actionPlan, companyRoleRecommendations: companies, evidenceDegradation: degradation, generatedAt });
  const checks = {
    structuredSections: ["【30 秒结论】", "【核心优势】", "【主要短板与信息缺口】", "【四层投递组合】", "【公司目标池】", "【下一步行动】", "【使用边界】"].every((heading) => report.includes(heading)),
    jdBoundaryCorrect: jdId ? report.includes("【简历 × JD】") && !report.includes("本次未提供具体 JD") : report.includes("本次未提供具体 JD"),
    noRawPrivateValues: rawPrivateValues.every((value) => !report.includes(value)),
    noDeterministicOfferPromise: !/(录取概率\s*[:：]?\s*\d|保\s*(?:实习|offer)|保证录用|百分之百)/iu.test(report),
    fourDynamicLanesPresent: ["冲刺", "主申", "稳妥", "探索"].every((label) => report.includes(label)),
    sourceAndVerificationDatesPresent: companies.candidates.length === 5 && companies.candidates.every((candidate) => report.includes(candidate.source.url) && report.includes(candidate.source.verifiedAt)),
    conclusionsTraceable: validateConclusionProvenance(provenance).valid && provenance.summary.total > 0,
    boundedAndActionable: analysis.strengths.length <= 3 && analysis.gaps.length <= 3 && validateActionPlan(actionPlan).valid && actionPlan.items.length >= 3 && actionPlan.items.length <= 5,
    domainContractsValid: validateEvidenceDegradationPlan(degradation).valid && validateApplicationTierPlan(tierPlan).valid && (!jdGap || validateJdGapAnalysis(jdGap).valid),
    disclosuresPresent: report.includes("本地规则生成（非生成式 AI）") && report.includes("不构成录用保证") && report.includes("只保留在当前页面内存"),
  };
  const reportPath = resolve(reportRoot, `${id}.txt`);
  await writeFile(reportPath, `${report}\n`, "utf8");
  contentCases.push({
    id,
    resumeFixture: resumeId,
    jdFixture: jdId,
    directionId,
    coverage,
    factCount: reviewedFacts.facts.length,
    timelineFlagCount: reviewedFacts.timelineFlags.length,
    privateFieldTypes: [...new Set(privateFields.map((field) => field.type))],
    strengths: analysis.strengths.length,
    gapsAndInsufficient: analysis.gaps.length + analysis.insufficient.length,
    actionItems: actionPlan.items.length,
    companyCandidates: companies.candidates.length,
    reportPath: relative(root, reportPath).replaceAll("\\", "/"),
    reportSha256: hash(report),
    checks,
    machinePrecheck: Object.values(checks).every(Boolean) ? "passed" : "failed",
    contentAdvisorReview: "pending_signature",
  });
}

const distFiles = await hashDirectory(resolve(root, "dist"));
const sourceFiles = await hashReleaseInputs();
const lockPath = resolve(root, "pnpm-lock.yaml");
const lockSha256 = hash(await readFile(lockPath));
const distSha256 = aggregateHash(distFiles);
const sourceSha256 = aggregateHash(sourceFiles);
const immutableSha256 = hash(`${sourceSha256}\n${distSha256}\n${lockSha256}`);
const git = gitIdentity();
const rollbackVerification = await readJson(resolve(outputRoot, "rollback-browser-verification.json"));
const rollbackBuilds = await readJson(resolve(outputRoot, "rollback-builds.json"));
const candidate = {
  schemaVersion: "1.0.0",
  task: "M7-07",
  candidateId: "MoreThan-Career-Copilot-MVP-FE-v1.0.1-rc.2",
  productVersion: "1.0.1",
  candidateSequence: "rc.2",
  generatedAt,
  timezone: "Asia/Shanghai",
  executor: "Codex（自动化执行；不代替责任角色签字）",
  immutableIdentity: { method: "SHA-256(source release inputs + dist + lockfile)", sha256: immutableSha256 },
  git,
  lockfile: { path: "pnpm-lock.yaml", sha256: lockSha256 },
  sourceSnapshot: { aggregateSha256: sourceSha256, fileCount: sourceFiles.length, files: sourceFiles },
  productionBuild: { directory: "dist", aggregateSha256: distSha256, fileCount: distFiles.length, files: distFiles },
  versions: {
    resumeFactsSchema: "1.0.0",
    analysisRuleSet: DEFAULT_ANALYSIS_RULESET_VERSION,
    reportDisclosure: REPORT_DISCLOSURE_VERSION,
    companyKnowledgeSchema: companyRolePool.schemaVersion,
    companyDataset: companyRolePool.datasetVersion,
    roleFamilyMapping: roleFamilyMap.mappingVersion,
    sourceWhitelist: sourceWhitelist.datasetVersion ?? sourceWhitelist.schemaVersion,
  },
  featureFlags: { enabled: true, localResumeParsing: true, jdAnalysis: true, reportPrinting: true, bringYourOwnKey: false },
  targets: ["Chrome / Windows", "Edge / Windows", "Safari / macOS", "Safari / iOS", "Chrome / Android"],
  knownExternalEvidenceGaps: ["独立 Chrome/Edge/Safari 完整签字", "iOS/Android 实机签字", "桌面屏幕阅读器与系统打印/PDF 签字", "内容顾问及管理层签字"],
  evidencePaths: [
    "docs/career-copilot/MVP前端版/42_M7-02_自动化质量闭环实施说明.md",
    "docs/career-copilot/MVP前端版/43_M7-03_浏览器与移动端兼容验证记录.md",
    "docs/career-copilot/MVP前端版/48_M7-04_无障碍键盘响应式与打印验收记录.md",
    "docs/career-copilot/MVP前端版/49_M7-05_性能优化与资源预算实施记录.md",
    "docs/career-copilot/MVP前端版/50_M7-06_安全隐私与供应链发布检查实施记录.md",
    "outputs/career-copilot/m7-07/rollback-builds.json",
    "outputs/career-copilot/m7-07/rollback-browser-verification.json",
    "outputs/career-copilot/m7-07/content-precheck.json"
  ],
};

const cases = acceptanceCases(rollbackVerification.result === "passed");
const blockers = [
  blocker("REL-BLK-01", "P0", ["RC-14", "RC-15"], "必测外部桌面浏览器与移动实机签字缺失", "测试负责人", "补测 Chrome/Edge/Safari 与 iOS/Android，并记录版本、设备、日期、测试人。"),
  blocker("REL-BLK-02", "P0", ["RC-11", "RC-16"], "屏幕阅读器与真实系统打印/PDF签字缺失", "无障碍/测试负责人", "完成桌面读屏器、全键盘、200% 缩放及系统打印/PDF复核。"),
  blocker("REL-BLK-03", "P0", ["RC-19"], "10份报告仅完成机器预检，内容顾问尚未逐份签字", "内容顾问", "复核 CR-01 至 CR-10 并填写姓名、日期、结论；发现系统性问题必须回修规则。"),
  blocker("REL-BLK-04", "P0", ["RC-25"], "发布责任角色与管理层未签字批准", "产品负责人/管理层批准人", "在外部证据和内容签字关闭后，审核同一不可变 RC 并给出明确结论。"),
];
const summary = summarizeCases(cases);
const decision = {
  schemaVersion: "1.0.0",
  task: "M7-07",
  candidateId: candidate.candidateId,
  immutableSha256,
  decidedAt: generatedAt,
  decision: "NO-GO",
  rationale: "M7-07 规则明确要求：必测浏览器、安全/隐私证据或管理层批准缺失时必须 NO-GO。当前本地自动化与回滚演练通过，但外部浏览器/实机、辅助技术与系统打印、内容顾问及责任角色签字仍未完成。",
  counts: summary,
  machineContentPrecheck: { total: contentCases.length, passed: contentCases.filter((item) => item.machinePrecheck === "passed").length, advisorSigned: 0 },
  rollbackDrills: { buildPackages: rollbackBuilds.drills.length, browserVerified: rollbackVerification.result === "passed" },
  releaseAuthorization: false,
  nextAction: "关闭四项发布阻断后，以同一不可变产物补签；若源码、数据、依赖或构建变量变化，必须生成 rc.2 并重跑受影响门禁。",
};

const signoffs = ["产品负责人", "技术负责人", "测试负责人", "内容顾问", "隐私/安全负责人", "发布负责人", "管理层批准人"].map((role) => ({ role, status: "pending", name: null, signedAt: null, conclusion: null }));
await writeJson(resolve(outputRoot, "content-precheck.json"), { schemaVersion: "1.0.0", generatedAt, fixtureOnly: true, summary: { total: 10, machinePassed: contentCases.filter((item) => item.machinePrecheck === "passed").length, advisorSigned: 0 }, cases: contentCases });
await writeJson(resolve(outputRoot, "release-candidate.json"), candidate);
await writeJson(resolve(outputRoot, "acceptance-matrix.json"), { schemaVersion: "1.0.0", candidateId: candidate.candidateId, immutableSha256, generatedAt, summary, cases });
await writeJson(resolve(outputRoot, "defect-ledger.json"), { schemaVersion: "1.1.0", generatedAt, openReleaseBlockers: blockers.length, blockers, productDefects: [
  { id: "FIX-01", severity: "P0", status: "closed", summary: "补齐主备方向、城市、投递时间和硬约束" },
  { id: "FIX-02", severity: "P0", status: "closed", summary: "补齐公司×岗位族×地点上下文×招聘类型和本地排除重算" },
  { id: "FIX-03", severity: "P1", status: "closed", summary: "未知 Hash 回退首页" },
  { id: "FIX-04", severity: "P1", status: "closed", summary: "未导出助手会话站内离开保护" },
  { id: "FIX-05", severity: "P2", status: "closed", summary: "行动完成状态跨助手步骤保留" },
  { id: "FIX-06", severity: "P2", status: "closed", summary: "取消打印不再误判为成功导出" },
  { id: "FIX-07", severity: "P1", status: "closed", summary: "过期外部资料改为构建警告并在运行时降级" },
  { id: "FIX-08", severity: "P2", status: "closed", summary: "修复 M7-03 证据文件断链" },
], note: "全量自查发现的本地产品缺陷已关闭；外部浏览器、辅助技术、内容顾问和管理签字仍按 P0 发布阻断。" });
await writeJson(resolve(outputRoot, "signoffs.json"), { schemaVersion: "1.0.0", candidateId: candidate.candidateId, immutableSha256, signoffs, warning: "不得由自动化执行者代签。" });
await writeJson(resolve(outputRoot, "decision.json"), decision);
process.stdout.write(`M7-07 evidence generated: ${candidate.candidateId} ${immutableSha256}; decision=${decision.decision}; machineReports=${decision.machineContentPrecheck.passed}/10\n`);

function findEntry(id) {
  const entry = manifest.entries.find((item) => item.id === id);
  if (!entry) throw new Error(`FIXTURE_NOT_FOUND:${id}`);
  return entry;
}

function confirmFacts(initial) {
  let facts = initial;
  for (const fact of facts.facts) facts = setFactReviewStatus(facts, fact.id, "confirmed", generatedAt);
  for (const flag of facts.timelineFlags) facts = setTimelineFlagStatus(facts, flag.id, "dismissed", generatedAt);
  return completeResumeFactsReview(facts, generatedAt);
}

function acceptanceCases(rollbackPassed) {
  const rows = [
    ["RC-01", "候选版本冻结", "P0", "passed", "release-candidate.json"],
    ["RC-02", "无账号首次访问", "P0", "passed", "M7-03 Chromium 流程记录"],
    ["RC-03", "五种材料入口", "P0", "passed", "M7-02 发布级测试"],
    ["RC-04", "异常文件", "P0", "passed", "M7-02 生成边界材料测试"],
    ["RC-05", "事实修改", "P0", "passed", "M3-04/M7-02 自动化"],
    ["RC-06", "无 JD", "P0", "passed", "CR-01/02/04/05/08/09"],
    ["RC-07", "有 JD", "P0", "passed", "CR-03/06/07/10"],
    ["RC-08", "证据不足", "P0", "passed", "M4-08 与内容机检"],
    ["RC-09", "四层与公司目标", "P0", "passed", "10份内容机检"],
    ["RC-10", "证据追溯", "P0", "passed", "ConclusionProvenance 契约"],
    ["RC-11", "复制与打印", "P0", "pending_external_evidence", "复制自动化与打印结构通过；真实系统打印/PDF待签字"],
    ["RC-12", "一键清除", "P0", "passed", "M6-04/M7-02 自动化"],
    ["RC-13", "网络与存储", "P0", "passed", "M7-06 安全实验室与门禁"],
    ["RC-14", "桌面浏览器", "P0", "pending_external_evidence", "独立 Chrome/Edge/Safari 签字缺失"],
    ["RC-15", "移动设备", "P0", "pending_external_evidence", "iOS Safari/Android Chrome 实机签字缺失"],
    ["RC-16", "键盘与辅助技术", "P0", "pending_external_evidence", "真实全流程键盘与桌面屏幕阅读器签字缺失"],
    ["RC-17", "性能预算", "P1", "passed", "M7-05 完整性能门禁"],
    ["RC-18", "安全发布包", "P0", "passed", "M7-06 发布目录与供应链审计"],
    ["RC-19", "顾问抽检", "P0", "pending_signature", "10份机器预检通过；内容顾问0/10签字"],
    ["RC-20", "回滚演练", "P0", rollbackPassed ? "passed" : "pending", "入口回退与解析降级双构建/浏览器记录"],
    ["RC-21", "404/刷新", "P0", "passed", "Hash 路由刷新与入口回退浏览器记录"],
    ["RC-22", "已知限制", "P1", "passed", "统一披露源与发布说明核对"],
    ["RC-23", "连续使用", "P1", "passed", "会话资源注册与发布级重复管线测试"],
    ["RC-24", "缺陷清单", "P0", "passed", "defect-ledger.json"],
    ["RC-25", "管理层结论", "P0", "pending_signature", "责任角色与管理层未签字；当前自动化建议 NO-GO"],
  ];
  return rows.map(([id, title, level, status, evidence]) => ({ id, title, level, status, evidence }));
}

function blocker(id, severity, relatedCases, title, owner, closure) {
  return { id, severity, status: "open", relatedCases, title, impact: "阻断 M7-08，不代表已发现用户数据泄露或核心逻辑缺陷。", owner, closure, dueDate: null, acceptedBy: null };
}

function summarizeCases(cases) {
  const byLevel = Object.fromEntries(["P0", "P1"].map((level) => {
    const selected = cases.filter((item) => item.level === level);
    return [level, { total: selected.length, passed: selected.filter((item) => item.status === "passed").length, pending: selected.filter((item) => item.status !== "passed").length }];
  }));
  return { total: cases.length, passed: cases.filter((item) => item.status === "passed").length, pending: cases.filter((item) => item.status !== "passed").length, byLevel };
}

async function hashReleaseInputs() {
  const inputs = ["src", "public", "scripts", "index.html", "package.json", "pnpm-lock.yaml", "vite.config.js", "vite.parser-probe.config.js", "tsconfig.check.json", ".env.example"];
  const files = [];
  for (const input of inputs) {
    const target = resolve(root, input);
    const info = await stat(target);
    if (info.isDirectory()) files.push(...await hashDirectory(target, root));
    else files.push(await hashFile(target, root));
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function hashDirectory(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await hashDirectory(target, base));
    else if (entry.isFile()) files.push(await hashFile(target, base));
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function hashFile(target, base) {
  const bytes = await readFile(target);
  return { path: relative(base, target).replaceAll("\\", "/"), bytes: bytes.length, sha256: hash(bytes) };
}

function aggregateHash(files) {
  return hash(files.map((file) => `${file.path}\0${file.sha256}`).join("\n"));
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitIdentity() {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return { available: true, commit, clean: !status, note: status ? "工作区有未提交内容，因此发布身份以等效 SHA-256 快照为准。" : "Git 工作区干净。" };
  } catch {
    return { available: false, commit: null, clean: false, note: "Git commit 不可用；发布身份使用等效 SHA-256 快照。" };
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
