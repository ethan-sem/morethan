import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "src", "career-copilot");
const unsupported = [
  ["ARRAY_TOSORTED_UNSUPPORTED", /\.toSorted\s*\(/u],
  ["ARRAY_TOREVERSED_UNSUPPORTED", /\.toReversed\s*\(/u],
  ["ARRAY_WITH_UNSUPPORTED", /\.with\s*\(/u],
  ["PROMISE_WITHRESOLVERS_UNSUPPORTED", /Promise\.withResolvers\s*\(/u],
  ["FILE_SYSTEM_ACCESS_WITHOUT_GUARD", /showOpenFilePicker\s*\(/u],
  ["USER_AGENT_BRANCH_FORBIDDEN", /navigator\.(?:userAgent|vendor)|\b(?:isSafari|isChrome|isEdge)\b/u],
  ["WEBKIT_ONLY_API_FORBIDDEN", /\bwebkit(?:RequestFileSystem|ResolveLocalFileSystemURL|SpeechRecognition)\b/u],
];

const failures = [];
for (const file of walk(sourceRoot)) {
  const rel = relative(sourceRoot, file).replaceAll("\\", "/");
  if (/\.test\.[jt]sx?$/u.test(rel)) continue;
  const source = readFileSync(file, "utf8");
  for (const [code, pattern] of unsupported) if (pattern.test(source)) failures.push({ code, file: rel });
}

if (failures.length) {
  console.error(`求职助手浏览器兼容门禁失败：${failures.length} 项问题。`);
  failures.forEach(({ code, file }) => console.error(`- ${code}: ${file}`));
  process.exit(1);
}
console.log("求职助手浏览器兼容门禁通过：未使用首发浏览器范围外的新 API、UA 分支或 WebKit 私有接口。");

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [".js", ".jsx", ".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}
