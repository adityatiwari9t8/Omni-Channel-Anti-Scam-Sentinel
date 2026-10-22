import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const allowFile = path.join(root, "scripts/privacy-allow.json");   // [{ "file": "...", "pattern": "...", "reason": "..." }]
const allow = existsSync(allowFile) ? JSON.parse(await readFile(allowFile, "utf8")) : [];
const PATTERNS = [
  [/\b(fetch|import)\s*\(\s*["'`]https?:\/\//, "network call to an http(s) URL"],
  [/\bnew\s+WebSocket\b/, "WebSocket"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bsendBeacon\b/, "sendBeacon"],
  [/\bnew\s+EventSource\b/, "EventSource"],
];
async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "tests"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) yield p;
  }
}
let failures = 0;
for (const top of ["packages", "apps"]) {
  const dir = path.join(root, top);
  if (!existsSync(dir)) continue;
  for await (const file of walk(dir)) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    const lines = (await readFile(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      for (const [re, what] of PATTERNS) {
        if (re.test(line) && !allow.some((a) => a.file === rel && line.includes(a.pattern))) {
          console.error(`FAIL ${rel}:${i + 1}  ${what}\n     ${t}`); failures++;
        }
      }
    });
  }
}
if (failures) { console.error(`\n${failures} privacy problem(s). Remove the call, or Role 3 adds a justified entry to scripts/privacy-allow.json.`); process.exit(1); }
console.log("Privacy check passed: no outbound network calls found in source.");
