import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const mode = process.argv[2] ?? "source";
const policy = readJson(join(root, "security", "m7-06-policy.json"));
const failures = [];
const textExtensions = new Set([".css", ".env", ".html", ".js", ".jsx", ".json", ".md", ".mjs", ".txt", ".ts", ".tsx", ".yaml", ".yml"]);
const secretPatterns = [
  ["SECRET_PRIVATE_KEY", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ["SECRET_AWS_ACCESS_KEY", /\bAKIA[0-9A-Z]{16}\b/u],
  ["SECRET_GOOGLE_API_KEY", /\bAIza[0-9A-Za-z_-]{35}\b/u],
  ["SECRET_GITHUB_TOKEN", /\bgh[pousr]_[0-9A-Za-z]{36,255}\b/u],
  ["SECRET_OPENAI_KEY", /\bsk-(?:proj|svcacct)-[0-9A-Za-z_-]{20,}\b/u],
  ["SECRET_SLACK_TOKEN", /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/u],
  ["SECRET_STRIPE_LIVE_KEY", /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/u],
  ["SECRET_DATABASE_URL", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@/iu],
  ["SECRET_HIGH_ENTROPY_ASSIGNMENT", /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|private[_-]?key)\b\s*[:=]\s*["'][0-9A-Za-z+/_=-]{24,}["']/iu],
];
const dangerousPatterns = [
  ["DANGEROUS_REACT_HTML", /dangerouslySetInnerHTML/u],
  ["DANGEROUS_INNER_HTML", /\.innerHTML\s*=/u],
  ["DANGEROUS_INSERT_HTML", /insertAdjacentHTML\s*\(/u],
  ["DANGEROUS_EVAL", /\beval\s*\(/u],
  ["DANGEROUS_FUNCTION_CONSTRUCTOR", /\bnew\s+Function\s*\(/u],
  ["DANGEROUS_STRING_TIMER", /\b(?:setTimeout|setInterval)\s*\(\s*["'`]/u],
  ["DANGEROUS_DOCUMENT_WRITE", /document\.write(?:ln)?\s*\(/u],
  ["DANGEROUS_JAVASCRIPT_URL", /["']javascript:/iu],
  ["DANGEROUS_REMOTE_SCRIPT", /<script\b[^>]*\bsrc=["']https?:\/\//iu],
];

if (mode === "source") validateSource();
else if (mode === "release") validateRelease();
else if (mode === "fixture") validateFixture(process.argv[3]);
else fail("SECURITY_MODE_INVALID", mode);

if (failures.length) {
  console.error(`求职助手安全门禁失败：${failures.length} 项违规。`);
  for (const item of failures) console.error(`- ${item.code}: ${item.file}`);
  process.exit(1);
}

if (mode === "source") console.log("求职助手源码安全门禁通过：秘密值、网络/存储、危险执行、外链、版本锁定和安全头配置符合关闭式策略。");
if (mode === "release") console.log("求职助手发布产物安全门禁通过：无秘密值、source map、开发地址或越界文件；依赖审计、许可证和 SHA-256 清单已生成。");
if (mode === "fixture") console.log("安全反向样本未触发门禁。 ");

function validateSource() {
  validatePolicy();
  const files = collectSourceFiles();
  for (const file of files) scanSecrets(rel(file), readFileSync(file, "utf8"));

  for (const file of walk(join(root, "src"))) {
    const fileRel = rel(file);
    if (!isApplicationSource(fileRel)) continue;
    const source = readFileSync(file, "utf8");
    scanDangerous(fileRel, source);
    if (/\bconsole\.(?:log|info|warn|error|debug)\s*\(/u.test(source)) fail("LOG_USER_DATA_RISK", fileRel);
  }

  validateNetworkAndStorage();
  validateAnchors();
  validateConfiguration();
  validateDependencies();
}

function validateRelease() {
  validateSource();
  const dist = join(root, "dist");
  if (!existsSync(dist)) {
    fail("RELEASE_DIRECTORY_MISSING", "dist");
    return;
  }
  const files = walk(dist, true);
  for (const file of files) {
    const fileRel = rel(file);
    const distRel = relative(dist, file).replaceAll("\\", "/");
    if (!isAllowedReleasePath(distRel)) fail("RELEASE_FILE_NOT_ALLOWLISTED", fileRel);
    if (/\.map$/iu.test(distRel) || /(?:^|\/)\.env(?:\.|$)/u.test(distRel) || /\.(?:log|pem|key)$/iu.test(distRel)) fail("RELEASE_SENSITIVE_FILE_FORBIDDEN", fileRel);
    if (!isTextFile(file)) continue;
    const source = readFileSync(file, "utf8");
    scanSecrets(fileRel, source);
    if (/sourceMappingURL\s*=/u.test(source)) fail("RELEASE_SOURCE_MAP_REFERENCE_FORBIDDEN", fileRel);
    if (/\b(?:localhost|127\.0\.0\.1)(?::\d+)?\b/iu.test(source)) fail("RELEASE_DEVELOPMENT_ADDRESS_FORBIDDEN", fileRel);
    if (/[A-Z]:\\(?:Users|Program Files)\\/u.test(source) || /file:\/\/\//iu.test(source)) fail("RELEASE_LOCAL_PATH_FORBIDDEN", fileRel);
    if (extname(file) === ".html" && /<script\b[^>]*\bsrc=["']https?:\/\//iu.test(source)) fail("RELEASE_REMOTE_SCRIPT_FORBIDDEN", fileRel);
  }
  validateHeaders(readFileSync(join(dist, "_headers"), "utf8"), "dist/_headers");
  validateDependencyAudit();
  if (!failures.length) writeReleaseReports(files);
}

function validateFixture(directory) {
  const fixtureRoot = resolve(directory ?? "");
  const allowedRoot = resolve(root, "tmp") + sep;
  if (!fixtureRoot.startsWith(allowedRoot) || !existsSync(fixtureRoot)) {
    fail("SECURITY_FIXTURE_PATH_INVALID", directory ?? "missing");
    return;
  }
  for (const file of walk(fixtureRoot, true)) {
    const fileRel = relative(fixtureRoot, file).replaceAll("\\", "/");
    if (!isTextFile(file)) continue;
    const source = readFileSync(file, "utf8");
    scanSecrets(fileRel, source);
    scanDangerous(fileRel, source);
    if (/sourceMappingURL\s*=/u.test(source)) fail("RELEASE_SOURCE_MAP_REFERENCE_FORBIDDEN", fileRel);
    if (/\bfetch\s*\(/u.test(source)) fail("NETWORK_CALL_NOT_ALLOWLISTED", fileRel);
    if (/(?:localStorage|sessionStorage)\.setItem\s*\(/u.test(source)) fail("STORAGE_WRITE_NOT_ALLOWLISTED", fileRel);
  }
}

function validatePolicy() {
  if (policy.schemaVersion !== "1.0.0") fail("SECURITY_POLICY_VERSION_INVALID", "security/m7-06-policy.json");
  for (const exception of policy.reviewedCodeExceptions ?? []) {
    const path = join(root, ...exception.file.split("/"));
    if (!existsSync(path) || sha256(readFileSync(path)) !== exception.sha256) fail("SECURITY_EXCEPTION_HASH_CHANGED", exception.file);
    if (!exception.owner || !/^\d{4}-\d{2}-\d{2}$/u.test(exception.expiresAt)) fail("SECURITY_EXCEPTION_GOVERNANCE_INVALID", exception.file);
  }
}

function validateNetworkAndStorage() {
  const productionFiles = walk(join(root, "src")).filter((file) => isApplicationSource(rel(file)));
  for (const file of productionFiles) {
    const fileRel = rel(file);
    const source = readFileSync(file, "utf8");
    const networkCall = /\b(?:fetch|fetcher|XMLHttpRequest|WebSocket|EventSource)\s*\(|navigator\.sendBeacon\s*\(/u;
    if (networkCall.test(source) && !policy.networkReaders.includes(fileRel)) fail("NETWORK_CALL_NOT_ALLOWLISTED", fileRel);
    if (/(?:localStorage|sessionStorage)\.setItem\s*\(/u.test(source) && !policy.storageWriters.includes(fileRel)) fail("STORAGE_WRITE_NOT_ALLOWLISTED", fileRel);
    if (/(?:indexedDB\.open|caches\.open|serviceWorker\.register|document\.cookie\s*=)/u.test(source)) fail("PERSISTENT_SURFACE_WRITE_FORBIDDEN", fileRel);
  }

  const loaderRel = policy.networkReaders[0];
  const loader = readFileSync(join(root, ...loaderRel.split("/")), "utf8");
  for (const token of [
    'const INDEX_PATH = "data/career-copilot/company-role-pool-index.json"',
    'method: "GET"',
    'credentials: "same-origin"',
    'redirect: "error"',
    'referrerPolicy: "no-referrer"',
  ]) if (!loader.includes(token)) fail("STATIC_NETWORK_POLICY_INCOMPLETE", loaderRel);
  if (/\b(?:resume|resumeFacts|jdText|documentParse|apiKey|draftKey)\b/iu.test(loader)) fail("STATIC_NETWORK_USER_DATA_REFERENCE_FORBIDDEN", loaderRel);
}

function validateAnchors() {
  for (const file of walk(join(root, "src"))) {
    const fileRel = rel(file);
    if (!isApplicationSource(fileRel)) continue;
    const source = readFileSync(file, "utf8");
    for (const tag of source.match(/<a\b[^>]*target=["']_blank["'][^>]*>/gu) ?? []) {
      if (!/rel=["'][^"']*\bnoopener\b[^"']*\bnoreferrer\b[^"']*["']/u.test(tag)
        && !/rel=["'][^"']*\bnoreferrer\b[^"']*\bnoopener\b[^"']*["']/u.test(tag)) fail("EXTERNAL_LINK_REL_INCOMPLETE", fileRel);
    }
  }
}

function validateConfiguration() {
  const vite = readFileSync(join(root, "vite.config.js"), "utf8");
  if (!/sourcemap:\s*false/u.test(vite)) fail("SOURCE_MAP_NOT_EXPLICITLY_DISABLED", "vite.config.js");
  const headersPath = join(root, "public", "_headers");
  if (!existsSync(headersPath)) fail("SECURITY_HEADERS_MISSING", "public/_headers");
  else validateHeaders(readFileSync(headersPath, "utf8"), "public/_headers");

  const envFiles = readdirSync(root).filter((name) => name === ".env" || (name.startsWith(".env.") && name !== ".env.example"));
  for (const file of envFiles) fail("LOCAL_ENV_FILE_PRESENT", file);
  const example = readFileSync(join(root, ".env.example"), "utf8");
  for (const line of example.split(/\r?\n/u)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/u);
    if (!match) continue;
    const [, name, value] = match;
    if (!/^VITE_COPILOT_[A-Z0-9_]+$/u.test(name) || !["", "true", "false"].includes(value)) fail("ENV_EXAMPLE_VALUE_NOT_PUBLIC", ".env.example");
  }
  const ignore = readFileSync(join(root, ".gitignore"), "utf8");
  for (const token of ["node_modules/", "dist/", ".env", "*.log", "tmp/"]) if (!ignore.includes(token)) fail("GITIGNORE_SECURITY_ENTRY_MISSING", ".gitignore");
}

function validateHeaders(source, file) {
  const required = [
    "default-src 'self'",
    "script-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: no-referrer",
    "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "X-Frame-Options: DENY",
    "/assets/*",
    "max-age=31536000, immutable",
    "/data/career-copilot/*",
    "must-revalidate",
  ];
  for (const token of required) if (!source.includes(token)) fail("SECURITY_HEADER_POLICY_INCOMPLETE", file);
  if (/script-src[^\n;]*'unsafe-eval'/u.test(source)) fail("CSP_UNSAFE_EVAL_FORBIDDEN", file);
  if (/script-src[^\n;]*https?:/u.test(source)) fail("CSP_REMOTE_SCRIPT_FORBIDDEN", file);
}

function validateDependencies() {
  const packageJson = readJson(join(root, "package.json"));
  for (const group of ["dependencies", "devDependencies"]) {
    for (const [name, version] of Object.entries(packageJson[group] ?? {})) {
      if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(String(version))) fail("DEPENDENCY_VERSION_NOT_EXACT", `${group}:${name}`);
    }
  }
  const locks = readdirSync(root).filter((name) => ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb"].includes(name));
  if (locks.length !== 1 || locks[0] !== "pnpm-lock.yaml") fail("LOCKFILE_SET_INVALID", locks.join(",") || "missing");
  const lock = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
  if (!lock.includes("lockfileVersion: '9.0'") || (lock.match(/resolution: \{integrity: sha512-/gu) ?? []).length < 20) fail("LOCKFILE_INTEGRITY_INCOMPLETE", "pnpm-lock.yaml");
}

function validateDependencyAudit() {
  const auditPath = join(root, "outputs", "career-copilot", "m7-06-dependency-audit.json");
  if (!existsSync(auditPath)) {
    fail("DEPENDENCY_AUDIT_MISSING", rel(auditPath));
    return;
  }
  const audit = readJson(auditPath);
  const lockHash = sha256(readFileSync(join(root, "pnpm-lock.yaml")));
  if (audit.lockfileSha256 !== lockHash) fail("DEPENDENCY_AUDIT_LOCK_MISMATCH", rel(auditPath));
  if (audit.status !== "passed" || audit.vulnerabilities?.critical !== 0 || audit.vulnerabilities?.high !== 0) fail("DEPENDENCY_HIGH_RISK_UNRESOLVED", rel(auditPath));
  const age = Date.now() - Date.parse(audit.auditedAt);
  if (!Number.isFinite(age) || age < 0 || age > 14 * 24 * 60 * 60 * 1000) fail("DEPENDENCY_AUDIT_STALE", rel(auditPath));
}

function writeReleaseReports(files) {
  const outputRoot = join(root, "outputs", "career-copilot");
  const manifest = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    sourceMapsPublished: false,
    fileCount: files.length,
    files: files.map((file) => ({
      path: relative(join(root, "dist"), file).replaceAll("\\", "/"),
      bytes: statSync(file).size,
      sha256: sha256(readFileSync(file)),
    })).sort((left, right) => left.path.localeCompare(right.path)),
  };
  writeFileSync(join(outputRoot, "m7-06-release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const packageJson = readJson(join(root, "package.json"));
  const components = Object.entries(packageJson.dependencies).map(([name, expectedVersion]) => {
    const installed = readJson(join(root, "node_modules", ...name.split("/"), "package.json"));
    if (installed.version !== expectedVersion) fail("INSTALLED_DEPENDENCY_VERSION_MISMATCH", name);
    return { name, version: installed.version, license: installed.license ?? "UNKNOWN", homepage: installed.homepage ?? null };
  }).sort((left, right) => left.name.localeCompare(right.name));
  const allowedLicenses = new Set(["Apache-2.0", "BSD-2-Clause", "ISC", "MIT"]);
  for (const component of components) if (!allowedLicenses.has(component.license)) fail("DEPENDENCY_LICENSE_REVIEW_REQUIRED", component.name);
  const supplyChain = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    lockfileSha256: sha256(readFileSync(join(root, "pnpm-lock.yaml"))),
    productionDependenciesPinned: true,
    auditReport: "m7-06-dependency-audit.json",
    components,
  };
  if (!failures.length) writeFileSync(join(outputRoot, "m7-06-supply-chain.json"), `${JSON.stringify(supplyChain, null, 2)}\n`, "utf8");
}

function scanSecrets(file, source) {
  for (const [code, pattern] of secretPatterns) if (pattern.test(source)) fail(code, file);
}

function scanDangerous(file, source, ignored = new Set()) {
  for (const [code, pattern] of dangerousPatterns) if (!ignored.has(code) && pattern.test(source)) fail(code, file);
}

function collectSourceFiles() {
  const directories = ["src", "public", "scripts", "docs", "security"];
  const files = directories.flatMap((directory) => walk(join(root, directory), true)).filter(isTextFile);
  for (const name of [".env.example", ".gitignore", "eslint.config.js", "index.html", "package.json", "pnpm-lock.yaml", "tsconfig.check.json", "vite.config.js", "vite.parser-probe.config.js"]) {
    const path = join(root, name);
    if (existsSync(path)) files.push(path);
  }
  return files;
}

function isApplicationSource(file) {
  return /^(?:src|public)\//u.test(file)
    && /\.(?:js|jsx|ts|tsx|html)$/u.test(file)
    && !/\.test\.[jt]sx?$/u.test(file)
    && file !== "src/test/setup.js";
}

function isAllowedReleasePath(path) {
  return path === "index.html"
    || path === "_headers"
    || path === ".vite/manifest.json"
    || /^(?:assets|data|game)\//u.test(path);
}

function isTextFile(file) {
  const extension = extname(file).toLowerCase();
  return textExtensions.has(extension) || [".gitignore", "_headers"].includes(file.split(/[\\/]/u).at(-1));
}

function walk(directory, includeAll = false) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path, includeAll);
    return includeAll || isTextFile(path) ? [path] : [];
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function rel(file) {
  return relative(root, file).replaceAll("\\", "/");
}

function fail(code, file) {
  failures.push({ code, file });
}
