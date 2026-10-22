import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
// folder -> required export, delivering role (1 = Utkarsh, 2 = Yash), and whether a model card is required
const REQUIRED = {
  "audio-detector":     { fn: "createAudioDetector",     roleName: "audio-module", card: true },
  "text-classifier":    { fn: "createTextClassifier",    roleName: "audio-module", card: true },
  "vision-detector":    { fn: "createVisionDetector",    roleName: "vision-module", card: true },
  "sync-detector":      { fn: "createSyncDetector",      roleName: "vision-module", card: false },
  "challenge-verifier": { fn: "createChallengeVerifier", roleName: "vision-module", card: false },
};
let failures = 0;
const fail = (m) => { console.error("FAIL " + m); failures++; };
const warn = (m) => console.warn("WARN " + m);

async function readmes(dir) {
  const found = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) found.push(...(await readmes(p)));
    else if (/^readme(\.|$)/i.test(e.name)) found.push(p);
  }
  return found;
}

for (const [dir, { fn, roleName, card }] of Object.entries(REQUIRED)) {
  const base = path.join(root, "packages", dir);
  if (!existsSync(base)) { fail(`${dir}: folder missing`); continue; }
  let pj;
  try { pj = JSON.parse(await readFile(path.join(base, "package.json"), "utf8")); }
  catch { fail(`${dir}: package.json missing or invalid`); continue; }
  if (pj.name !== `@sentinel/${dir}`) fail(`${dir}: package name must be @sentinel/${dir}, found ${pj.name}`);
  const deps = { ...pj.dependencies, ...pj.devDependencies };
  for (const [n, v] of Object.entries(deps)) {
    if (String(v).startsWith("workspace:")) continue;
    if (/^[\^~]|latest|\*/.test(String(v))) fail(`${dir}: dependency ${n}@${v} must be pinned to an exact version`);
  }
  const isStub = Boolean(deps["@sentinel/mocks"]);
  if (isStub) warn(`${dir}: still a stub (depends on @sentinel/mocks)`);
  const idx = path.join(base, "src/index.ts");
  if (!existsSync(idx)) fail(`${dir}: src/index.ts missing`);
  else {
    const src = await readFile(idx, "utf8");
    if (!src.includes(fn) || !/\bexport\b/.test(src)) fail(`${dir}: src/index.ts must export ${fn}`);
  }
  // One repository, one README (the root one, owned by Full-Stack Integration). Role packages must not have their own.
  for (const r of await readmes(base)) fail(`${dir}: remove ${path.relative(root, r)} (the repo has a single root README; put notes in docs/${roleName}/HANDOVER.md)`);
  if (!isStub) {
    const notes = path.join(root, "docs", roleName);
    if (!existsSync(path.join(notes, "HANDOVER.md"))) fail(`${dir}: docs/${roleName}/HANDOVER.md missing`);
    if (card && !existsSync(path.join(notes, "MODEL_CARD.md"))) fail(`${dir}: docs/${roleName}/MODEL_CARD.md missing`);
  }
  const af = path.join(base, "sentinel.assets.json");
  if (!existsSync(af)) fail(`${dir}: sentinel.assets.json missing`);
  else {
    try {
      const { assets } = JSON.parse(await readFile(af, "utf8"));
      for (const a of assets) {
        if (a.from.startsWith("node_modules:")) continue;
        if (!existsSync(path.join(base, a.from))) fail(`${dir}: asset missing "${a.from}" (copy the model files into assets/)`);
      }
    } catch { fail(`${dir}: sentinel.assets.json is not valid JSON of the form { "assets": [...] }`); }
  }
}
if (failures) { console.error(`\n${failures} problem(s). The owner of each package fixes it inside their own folder.`); process.exit(1); }
console.log("Integration check passed.");
