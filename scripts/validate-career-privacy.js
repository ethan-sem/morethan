import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(root, "src", "career-copilot");
const allowedStorageWriter = "lib/sessionStore.js";
const allowedCookieCleaner = "lib/careerSessionCleanup.js";
const allowedStaticNetworkReader = "lib/companyRolePoolLoader.js";
const forbiddenNetwork = /\b(?:fetch|fetcher|XMLHttpRequest|WebSocket|EventSource)\s*\(|navigator\.sendBeacon\s*\(/;
const forbiddenUrlState = /(?:history\.(?:pushState|replaceState)|new\s+URLSearchParams\s*\(|location\.(?:hash|search)\s*=)/;
const storageWrite = /(?:localStorage|sessionStorage|storage)\.setItem\s*\(/;
const indexedWrite = /indexedDB\.(?:open|deleteDatabase)\s*\(/;
const cacheWrite = /caches\.(?:open|delete)\s*\(/;
const cookieWrite = /document\.cookie\s*=/;
const sensitiveSerialization = /JSON\.stringify\s*\(\s*(?:resume|resumeFacts|documentParse|jdText|careerAnalysis|actionPlan|report|apiKey)\b/i;
const unsafeSecretLogging = /console\.(?:log|info|warn|error|debug)\s*\([^\n]*(?:apiKey|secret|token|draftKey)/i;
const unsafeSecretDomReflection = /(?:textContent|innerHTML|dangerouslySetInnerHTML)\s*[=:][^\n]*(?:apiKey|secret|token|draftKey)/i;
const unsafeSecretAutocomplete = /autoComplete=["'](?:on|current-password)["']/i;

const failures = [];
for (const file of walk(sourceRoot)) {
  const rel = relative(sourceRoot, file).replaceAll("\\", "/");
  if (/\.test\.[jt]sx?$/.test(rel)) continue;
  const source = readFileSync(file, "utf8");
  if (rel !== allowedStaticNetworkReader) check(rel, source, forbiddenNetwork, "PRIVACY_NETWORK_CALL_FORBIDDEN");
  if (rel === allowedStaticNetworkReader) {
    requireToken(rel, source, 'const INDEX_PATH = "data/career-copilot/company-role-pool-index.json"', "PRIVACY_STATIC_INDEX_PATH_MISSING");
    requireToken(rel, source, 'credentials: "same-origin"', "PRIVACY_STATIC_REQUEST_CREDENTIAL_POLICY_MISSING");
    check(rel, source, /\b(?:resume|resumeFacts|jdText|documentParse|apiKey|draftKey)\b/i, "PRIVACY_STATIC_REQUEST_SENSITIVE_INPUT_FORBIDDEN");
  }
  check(rel, source, forbiddenUrlState, "PRIVACY_URL_STATE_FORBIDDEN");
  check(rel, source, sensitiveSerialization, "PRIVACY_SENSITIVE_SERIALIZATION_FORBIDDEN");
  check(rel, source, unsafeSecretLogging, "PRIVACY_SECRET_LOGGING_FORBIDDEN");
  check(rel, source, unsafeSecretDomReflection, "PRIVACY_SECRET_DOM_REFLECTION_FORBIDDEN");
  check(rel, source, unsafeSecretAutocomplete, "PRIVACY_SECRET_AUTOCOMPLETE_FORBIDDEN");
  if (rel !== allowedStorageWriter) check(rel, source, storageWrite, "PRIVACY_STORAGE_WRITE_FORBIDDEN");
  if (rel !== allowedCookieCleaner) check(rel, source, cookieWrite, "PRIVACY_COOKIE_WRITE_FORBIDDEN");
  if (rel !== allowedCookieCleaner) {
    check(rel, source, indexedWrite, "PRIVACY_INDEXEDDB_WRITE_FORBIDDEN");
    check(rel, source, cacheWrite, "PRIVACY_CACHE_WRITE_FORBIDDEN");
  }
}

if (failures.length) {
  console.error(`求职助手隐私门禁失败：${failures.length} 项违规。`);
  failures.forEach(({ code, file }) => console.error(`- ${code}: ${file}`));
  process.exit(1);
}
console.log("求职助手隐私门禁通过：无敏感持久化、URL 状态写入、默认网络发送或密钥日志反射；仅允许白名单流程状态写入 sessionStorage。");

function check(file, source, pattern, code) { if (pattern.test(source)) failures.push({ code, file }); }
function requireToken(file, source, token, code) { if (!source.includes(token)) failures.push({ code, file }); }
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [".js", ".jsx", ".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}
