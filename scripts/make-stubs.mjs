// Creates the five stub role packages (only if the folder does not exist yet). Run once: node scripts/make-stubs.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const STUBS = [
  { dir: "audio-detector", fn: "createAudioDetector", mock: "mockAudioDetector", type: "AudioDetector" },
  { dir: "text-classifier", fn: "createTextClassifier", mock: "mockTextClassifier", type: "TextClassifier" },
  { dir: "vision-detector", fn: "createVisionDetector", mock: "mockVisionDetector", type: "VisionDetector" },
  { dir: "sync-detector", fn: "createSyncDetector", mock: "mockSyncDetector", type: "SyncDetector" },
  { dir: "challenge-verifier", fn: "createChallengeVerifier", mock: "mockChallengeVerifier", type: "ChallengeVerifier" },
];
for (const s of STUBS) {
  const base = path.join(root, "packages", s.dir);
  if (existsSync(base)) { console.log(`skip ${s.dir} (exists)`); continue; }
  await mkdir(path.join(base, "src"), { recursive: true });
  await writeFile(path.join(base, "package.json"), JSON.stringify({
    name: `@sentinel/${s.dir}`, version: "0.1.0", private: true, type: "module", main: "src/index.ts", types: "src/index.ts",
    dependencies: { "@sentinel/contracts": "workspace:*", "@sentinel/mocks": "workspace:*" },
  }, null, 2) + "\n");
  await writeFile(path.join(base, "sentinel.assets.json"), '{ "assets": [] }\n');
  await writeFile(path.join(base, "src/index.ts"),
`import { ${s.mock} } from "@sentinel/mocks";
import type { ${s.type} } from "@sentinel/contracts";

// STUB: re-exports the mock. The owner's real package replaces this whole folder.
export function ${s.fn}(): ${s.type} {
  return ${s.mock}();
}
`);
  console.log(`created stub ${s.dir}`);
}
