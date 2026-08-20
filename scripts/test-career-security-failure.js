import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = resolve(root, "tmp", "m7-06-intentional-security-failure");
rmSync(fixture, { recursive: true, force: true });
mkdirSync(fixture, { recursive: true });

const fakeSecret = ["sk", "proj", "A".repeat(40)].join("-");
writeFileSync(join(fixture, "leak.js"), `export const apiKey = "${fakeSecret}";\neval("2 + 2");\nfetch("https://tracker.invalid/collect");\nlocalStorage.setItem("resume", "private");\n//# sourceMappingURL=leak.js.map\n`, "utf8");

const result = spawnSync(process.execPath, [join(root, "scripts", "validate-career-security.js"), "fixture", fixture], { encoding: "utf8" });
rmSync(fixture, { recursive: true, force: true });

const output = `${result.stdout}\n${result.stderr}`;
const expected = ["SECRET_OPENAI_KEY", "DANGEROUS_EVAL", "NETWORK_CALL_NOT_ALLOWLISTED", "STORAGE_WRITE_NOT_ALLOWLISTED", "RELEASE_SOURCE_MAP_REFERENCE_FORBIDDEN"];
if (result.status === 0 || expected.some((code) => !output.includes(code))) {
  console.error("安全门禁反向测试失败：故意违规样本没有被完整拦截。");
  process.exit(1);
}

console.log("PASS 安全门禁反向测试：秘密值、动态执行、网络、存储和 source map 违规均返回非零状态。");
