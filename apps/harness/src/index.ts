import { runContractSelfTest, type CheckResult, type SelfTestDeps } from "@sentinel/contracts";
import { createAudioDetector } from "@sentinel/audio-detector";
import { createTextClassifier } from "@sentinel/text-classifier";
import { createVisionDetector } from "@sentinel/vision-detector";
import { createSyncDetector } from "@sentinel/sync-detector";
import { createChallengeVerifier } from "@sentinel/challenge-verifier";

const assetBase = new URL("./", document.baseURI).href;   // the harness is served from the dist folder root

async function blankBitmap(): Promise<ImageBitmap> {
  const c = document.createElement("canvas");
  c.width = 320; c.height = 180;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height);
  return createImageBitmap(c);
}
async function loadTestFace(): Promise<ImageBitmap> {
  try {
    const res = await fetch(assetBase + "selftest/face.jpg");
    if (!res.ok) throw new Error(String(res.status));
    return await createImageBitmap(await res.blob());
  } catch {
    console.warn("selftest/face.jpg not found; using a blank frame (fine for mocks, real vision will report no face)");
    return blankBitmap();
  }
}

function buildDeps(): SelfTestDeps {
  return {
    audio: createAudioDetector(), vision: createVisionDetector(), sync: createSyncDetector(),
    challenge: createChallengeVerifier(), text: createTextClassifier(),
  };
}

const tbody = document.querySelector("#results tbody")!;
const summary = document.getElementById("summary")!;
const copyBtn = document.getElementById("copy") as HTMLButtonElement;
let last: CheckResult[] = [];

function render(results: CheckResult[]) {
  tbody.innerHTML = "";
  for (const r of results) {
    const tr = document.createElement("tr");
    for (const text of [r.module, r.name, r.ok ? "PASS" : "FAIL", r.detail, String(r.ms)]) {
      const td = document.createElement("td");
      td.textContent = text;
      if (text === "PASS") td.className = "ok";
      if (text === "FAIL") td.className = "bad";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  const failed = results.filter((r) => !r.ok).length;
  summary.textContent = failed === 0 ? `All ${results.length} checks passed.` : `${failed} of ${results.length} checks FAILED.`;
  summary.className = failed === 0 ? "ok" : "bad";
}

async function run() {
  summary.textContent = "Running...";
  const deps = buildDeps();
  const flags = ["audio", "vision", "sync", "challenge", "text"].map((k) => `${k}: ${(deps as any)[k].isMock ? "mock" : "real"}`).join(", ");
  last = await runContractSelfTest(deps, { assetBase, loadTestFace, loadBlankFrame: blankBitmap });
  render(last);
  summary.textContent += `  (${flags})`;
  copyBtn.disabled = false;
  (window as any).__selftest = { results: last, flags, passed: last.every((r) => r.ok) };   // for headless runs
}

document.getElementById("run")!.addEventListener("click", run);
copyBtn.addEventListener("click", () => navigator.clipboard.writeText(JSON.stringify(last, null, 2)));
if (new URLSearchParams(location.search).get("auto") === "1") void run();
