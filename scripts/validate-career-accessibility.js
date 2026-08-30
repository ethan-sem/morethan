import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(root, "src", "career-copilot");
const cssPath = join(root, "src", "career-copilot.css");
const htmlPath = join(root, "index.html");
const failures = [];

for (const file of walk(sourceRoot)) {
  const rel = relative(root, file).replaceAll("\\", "/");
  if (/\.test\.[jt]sx?$/.test(rel)) continue;
  const source = readFileSync(file, "utf8");
  forbid(rel, source, /tabIndex\s*=\s*{\s*[1-9]|tabindex\s*=\s*["'][1-9]/, "A11Y_POSITIVE_TABINDEX_FORBIDDEN");
  forbid(rel, source, /\bautoFocus\b/, "A11Y_AUTOFOCUS_FORBIDDEN");
  forbid(rel, source, /<main\b/, "A11Y_NESTED_MAIN_FORBIDDEN");
  forbid(rel, source, /<(?:div|span|section|article|p|li)\b[^>]*\bonClick\s*=/, "A11Y_NON_INTERACTIVE_CLICK_TARGET");

  for (const tag of source.match(/<a\b[^>]*target=["']_blank["'][^>]*>/g) ?? []) {
    if (!/rel=["'][^"']*(?:noopener|noreferrer)[^"']*["']/.test(tag)) fail(rel, "A11Y_EXTERNAL_LINK_REL_MISSING");
  }
  for (const tag of source.match(/<img\b[^>]*>/g) ?? []) {
    if (!/\balt=/.test(tag)) fail(rel, "A11Y_IMAGE_ALT_MISSING");
  }
  for (const tag of source.match(/<button\b[^>]*role=["']tab["'][^>]*>/g) ?? []) {
    for (const attribute of ["id", "aria-controls", "aria-selected", "tabIndex"]) {
      if (!new RegExp(`\\b${attribute}=`).test(tag)) fail(rel, `A11Y_TAB_${attribute.toUpperCase().replace("-", "_")}_MISSING`);
    }
  }
  for (const tag of source.match(/<[^>]+role=["']tabpanel["'][^>]*>/g) ?? []) {
    if (!/\bid=/.test(tag) || !/\baria-labelledby=/.test(tag)) fail(rel, "A11Y_TABPANEL_RELATION_MISSING");
  }
  for (const tag of source.match(/<[^>]+role=["']alertdialog["'][^>]*>/g) ?? []) {
    for (const attribute of ["aria-modal", "aria-labelledby", "aria-describedby"]) {
      if (!new RegExp(`\\b${attribute}=`).test(tag)) fail(rel, `A11Y_DIALOG_${attribute.toUpperCase().replaceAll("-", "_")}_MISSING`);
    }
  }
}

const css = readFileSync(cssPath, "utf8");
const factsGoals = readFileSync(join(sourceRoot, "screens", "FactsGoalsScreens.jsx"), "utf8");
const factReview = readFileSync(join(sourceRoot, "components", "FactReviewWorkspace.jsx"), "utf8");
requireToken("src/career-copilot/screens/FactsGoalsScreens.jsx", factsGoals, 'aria-describedby={jdError ? "copilot-jd-error" : undefined}', "A11Y_JD_ERROR_RELATION_MISSING");
requireToken("src/career-copilot/components/FactReviewWorkspace.jsx", factReview, "aria-describedby={error ? errorId : undefined}", "A11Y_FACT_ERROR_RELATION_MISSING");
requireToken("src/career-copilot.css", css, ":focus-visible", "A11Y_FOCUS_VISIBLE_RULE_MISSING");
requireToken("src/career-copilot.css", css, ".copilot-upload-zone:focus-within", "A11Y_UPLOAD_FOCUS_RULE_MISSING");
requireToken("src/career-copilot.css", css, "@media (prefers-reduced-motion: reduce)", "A11Y_REDUCED_MOTION_RULE_MISSING");
requireToken("src/career-copilot.css", css, "@media (forced-colors: active)", "A11Y_FORCED_COLORS_RULE_MISSING");
requireToken("src/career-copilot.css", css, "@page { size: A4", "A11Y_A4_PAGE_RULE_MISSING");
requireToken("src/career-copilot.css", css, "@media print", "A11Y_PRINT_MEDIA_RULE_MISSING");
requireToken("src/career-copilot.css", css, "body * { visibility: hidden; }", "A11Y_PRINT_DEFAULT_VISIBILITY_MISSING");
requireToken("src/career-copilot.css", css, ".copilot-report-screen, .copilot-report-screen * { visibility: visible; }", "A11Y_PRINT_REPORT_VISIBILITY_MISSING");
requireToken("src/career-copilot.css", css, ".copilot-report-screen button", "A11Y_PRINT_CONTROL_HIDING_MISSING");
requireToken("src/career-copilot.css", css, "break-inside: avoid", "A11Y_PRINT_BREAK_PROTECTION_MISSING");
requireToken("src/career-copilot.css", css, "overflow-wrap: anywhere", "A11Y_LONG_CONTENT_WRAP_MISSING");
requireToken("src/career-copilot.css", css, ".copilot-company-target-grid a { min-height: 32px", "A11Y_COMPANY_LINK_TARGET_TOO_SMALL");

const html = readFileSync(htmlPath, "utf8");
requireToken("index.html", html, '<html lang="zh-CN">', "A11Y_DOCUMENT_LANGUAGE_MISSING");
requireToken("index.html", html, 'name="viewport"', "A11Y_VIEWPORT_META_MISSING");

if (failures.length) {
  console.error(`求职助手无障碍门禁失败：${failures.length} 项违规。`);
  failures.forEach(({ code, file }) => console.error(`- ${code}: ${file}`));
  process.exit(1);
}

console.log("求职助手无障碍门禁通过：键盘顺序、标签页/弹窗关系、焦点样式、减少动态效果、强制颜色和打印结构满足当前发布规则。");

function fail(file, code) { failures.push({ file, code }); }
function forbid(file, source, pattern, code) { if (pattern.test(source)) fail(file, code); }
function requireToken(file, source, token, code) { if (!source.includes(token)) fail(file, code); }
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [".js", ".jsx", ".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}
