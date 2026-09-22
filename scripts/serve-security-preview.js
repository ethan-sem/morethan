import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const requestedDist = process.env.MORETHAN_PREVIEW_DIST ?? "dist";
const dist = resolve(root, requestedDist);
if (dist !== root && !dist.startsWith(`${root}${sep}`)) throw new Error("PREVIEW_DIST_OUTSIDE_PROJECT");
const host = "127.0.0.1";
const port = Number(process.env.MORETHAN_SECURITY_PREVIEW_PORT ?? 4176);
const headerRules = parseHeaderRules(readFileSync(join(dist, "_headers"), "utf8"));
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

const server = createServer((request, response) => {
  const pathname = safePathname(request.url);
  console.log(`[SECURITY_REQUEST] ${request.method ?? "UNKNOWN"} ${pathname}`);
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const candidate = resolve(dist, `.${requestedPath}`);
  if (!candidate.startsWith(`${dist}${sep}`) || !existsSync(candidate) || !statSync(candidate).isFile()) {
    response.writeHead(404, securityHeaders(pathname));
    response.end("Not found");
    return;
  }
  response.writeHead(200, { ...securityHeaders(requestedPath), "Content-Type": mimeTypes.get(extname(candidate).toLowerCase()) ?? "application/octet-stream" });
  response.end(readFileSync(candidate));
});

server.listen(port, host, () => console.log(`Edutoro secure preview: http://${host}:${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));

function safePathname(value) {
  try { return decodeURIComponent(new URL(value ?? "/", `http://${host}`).pathname); }
  catch { return "/invalid"; }
}

function securityHeaders(pathname) {
  const result = {};
  for (const rule of headerRules) if (matches(rule.pattern, pathname)) Object.assign(result, rule.headers);
  return result;
}

function matches(pattern, pathname) {
  if (pattern === "/*") return true;
  if (pattern.endsWith("/*")) return pathname.startsWith(pattern.slice(0, -1));
  return pattern === pathname;
}

function parseHeaderRules(source) {
  const rules = [];
  let current;
  for (const rawLine of source.split(/\r?\n/u)) {
    if (!rawLine.trim()) continue;
    if (!/^\s/u.test(rawLine)) {
      current = { pattern: rawLine.trim(), headers: {} };
      rules.push(current);
      continue;
    }
    const separator = rawLine.indexOf(":");
    if (!current || separator < 0) continue;
    current.headers[rawLine.slice(0, separator).trim()] = rawLine.slice(separator + 1).trim();
  }
  return rules;
}
