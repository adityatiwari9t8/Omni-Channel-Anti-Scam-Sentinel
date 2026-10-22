// Usage: node scripts/check-ownership.mjs <1|2>
// Fails if any file you changed or created is outside the paths owned by your role, or if you created a README.
// Baseline: the point where your branch left origin/main (after the project is on GitHub), otherwise the local tag scaffold-baseline.
import { execSync } from "node:child_process";

const role = process.argv[2];
const OWN = {
  "1": ["packages/audio-detector/", "packages/text-classifier/", "colab/audio/", "colab/text/", "eval/audio/", "eval/text/", "eval/clips/labels/role1.csv", "docs/role1/"],
  "2": ["packages/vision-detector/", "packages/sync-detector/", "packages/challenge-verifier/", "colab/vision/", "eval/vision/", "eval/clips/labels/role2.csv", "docs/role2/"],
};
if (!OWN[role]) { console.error("Usage: node scripts/check-ownership.mjs <1|2>   (Role 3 owns everything else and is not checked)"); process.exit(2); }

const sh = (c) => execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").map((s) => s.trim()).filter(Boolean);
function baseRef() {
  if (process.env.OWNERSHIP_BASE) return process.env.OWNERSHIP_BASE;
  try { return sh("git merge-base HEAD origin/main")[0]; } catch { /* no remote yet */ }
  try { sh("git rev-parse --verify scaffold-baseline"); return "scaffold-baseline"; } catch { /* no tag */ }
  return null;
}
const base = baseRef();
if (!base) {
  console.error("No baseline found. Before the project is on GitHub, run once right after creating the scaffold:\n  git init -b main && git add -A && git commit -m scaffold && git tag scaffold-baseline");
  process.exit(2);
}
const changed = [...new Set([...sh(`git diff --name-only ${base}`), ...sh("git ls-files --others --exclude-standard")])];
const owned = (f) => OWN[role].some((p) => f === p || f.startsWith(p));
const outside = changed.filter((f) => !owned(f));
const readmes = changed.filter((f) => owned(f) && /(^|\/)readme(\.|$)/i.test(f));
if (outside.length || readmes.length) {
  if (outside.length) {
    console.error(`FAIL: ${outside.length} file(s) changed outside the paths owned by Role ${role}:`);
    outside.forEach((f) => console.error("  " + f));
    console.error(`Revert them (git checkout ${base} -- <file>) or ask the owner.`);
  }
  if (readmes.length) {
    console.error(`FAIL: README files are not allowed in role folders (the repo has one root README):`);
    readmes.forEach((f) => console.error("  " + f));
    console.error(`Put the notes in docs/role${role}/HANDOVER.md instead.`);
  }
  process.exit(1);
}
console.log(`Ownership check passed for Role ${role} (base ${base.slice(0, 12)}): ${changed.length} changed file(s), all inside owned paths.`);
