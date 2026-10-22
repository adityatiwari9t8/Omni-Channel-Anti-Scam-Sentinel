# FULL-STACK INTEGRATION: Full-Stack and Integration (Extension, Arbiter, Alert UI)

Owner: Aditya
Read first: `00-master-integration-doc.md` (contracts in section 4 are binding).

## START HERE: generate Full-Stack Integration with a coding agent

1. Make an empty folder (for example `sentinel/`). Inside it create `docs/` and put two files there: `00-master-integration-doc.md` and `fullstack-extension.md`.
2. Open a coding agent (Claude Code, Cursor agent, or similar) in that folder and allow it to run shell commands.
3. Fill in the **decision inputs** below (leave a line blank and the agent chooses a safe default and records it).
4. Paste the prompt below, and nothing else.
5. When the agent finishes, read its FINAL REPORT and do the human steps it lists (loading the extension in Chrome and testing on a real Meet call are always human steps; an agent cannot do them).
6. When Utkarsh (Audio Module) and Yash (Vision Module) send their tarballs, put them in a `handovers/` folder and follow master doc 18.5 (or ask the agent to).
7. When the full stack works, the agent writes the single root `README.md`; you push the project to GitHub (master doc 18.8) and add Utkarsh and Yash as collaborators. They clone it and continue on branches with pull requests.

### Decision inputs (edit before you paste; blank means "agent decides and records it")
```
Platform: Google Meet only (confirm yes/no): 
Alert style: in-page overlay (+ optional notification/sound) (confirm yes/no): 
Keep the Gmail phishing banner in scope (yes/no/decide later): 
```

### The prompt (paste exactly; the lines above are filled in by you, the agent reads them from this document)
```
You are a coding agent working in an empty folder. docs/00-master-integration-doc.md and docs/fullstack-extension.md
describe the Sentinel project (a Chrome extension that detects deepfake voices and faces, and phishing emails, entirely
inside the browser). You are generating FULL-STACK INTEGRATION: the scaffold owner and integrator (arbiter, pipeline, Chrome extension,
overlay, popup, Gmail banner, harness extensions, benchmarks docs).
Work autonomously. Do not ask me questions except in the cases listed in master doc section 17.2.
Follow the rules in master doc section 17.1 and finish with the final report in section 17.3.

Steps:
1. Read both documents completely, including the decision inputs at the top of the Full-Stack Integration document.
2. Create the scaffold exactly as in master doc Appendix A (all files, no edits to contracts, fixtures, self-test, or
   mocks). Then run: node scripts/make-stubs.mjs ; pnpm install ; pnpm verify:parts ; git init -b main && git add -A &&
   git commit -m scaffold && git tag scaffold-baseline. pnpm verify:parts must pass before you continue.
3. Generate everything else Full-Stack Integration owns, following Part B3 of the Full-Stack Integration document step by step: packages/arbiter,
   packages/pipeline, apps/extension (manifest, service worker, offscreen document, Meet and Gmail content scripts, overlay,
   popup), the harness replay page, docs (benchmarks, demo script, spike notes template, README). Use master doc sections 3
   and 7 to 9 as the design; copy the message formats and defaults exactly.
4. Run pnpm test after every package and pnpm verify at the end. pnpm verify must pass (it builds the extension).
5. If a folder named handovers/ contains audio-module-*.tgz or vision-module-*.tgz, integrate them with master doc 18.5, then run pnpm verify.
   The repository has ONE README: write the root README.md yourself (what Sentinel is, how to install, build, test, load the
   extension, the architecture in a few lines, honest results, limitations, who did what), using the docs/role1 and
   docs/role2 HANDOVER.md notes and only what was measured. Never add README files inside packages.
6. Print the FINAL REPORT (master doc 17.3). In section 6 list the human steps: load apps/extension/dist unpacked in Chrome,
   answer the spike questions in docs/spike-notes.md on a live Meet call, run pnpm harness and the self-test, record the
   benchmark numbers, check the Network tab shows no uploads, then push to GitHub with master doc 18.8 and add Utkarsh and Yash as collaborators.
```

---

## 1. Your mission

Build the Chrome extension that captures the call, feeds the audio and video detectors, makes the final decision, and shows the alert. You are also the **integrator**: you own the contracts, the mocks, the test harness, and the benchmarks, so the three roles combine into one working product.

You deliver:
- `packages/contracts`: shared types and message schemas
- `packages/mocks`: mock versions of every detector interface
- `apps/extension`: manifest, service worker, offscreen document, content scripts, UI
- `apps/harness`: local page that plays a video file through the full pipeline
- The arbiter (fusion, state machine, challenge flow)
- JSONL decision logs, a benchmark harness, and the demo script

## 2. First deliverables (the whole team waits on these)

1. Repo created with the layout from the master doc (section 5), TypeScript + esbuild + React (popup only), pnpm workspaces, Chrome Manifest V3.
2. `packages/contracts` with every type, message format, fixture, and the self-test from the master doc (sections 4 and 11.2).
3. `packages/mocks` with scripted detectors (master doc section 6.4) **and the five stub role packages** that re-export them, so the workspace builds before any real code exists and the real folders can replace the stubs.
4. A working **capture spike**: click the extension icon on a Meet tab, get tab audio into the offscreen document, and get frames from the remote `<video>` element into the offscreen document.
5. A first overlay on the Meet tab showing the state from the mocks.

**M1:** announce that contracts are frozen. After that, changes need all three owners.

## 3. Capture pipeline

The full design, code, and message formats are in the master doc: architecture (section 3), contracts and messages (section 4), build and manifest (section 7), runtime wiring (section 8), pipeline and arbiter (section 9). This section only lists what is yours to get right.

- **Audio:** `getMediaStreamId` in the service worker after the user presses Start in the popup, then `getUserMedia` in the offscreen document. Use **two** `AudioContext`s from the same stream: a default-rate one wired to the speakers so the user keeps hearing the call, and a 16 kHz one feeding the `chunker` AudioWorklet (100 ms mono chunks). Resume both contexts.
- **Video:** the Meet content script picks the remote `<video>`, samples at most 5 fps with `requestVideoFrameCallback`, downscales to at most 480 px wide, encodes **JPEG** (`quality` about 0.7), and sends base64 over one port named `sentinel-meet`. Chrome extension messaging serializes as JSON, so an `ImageBitmap` cannot be sent directly. The pipeline decodes the JPEG back to an `ImageBitmap`.
- **Clock:** `performance.timeOrigin + performance.now()` in every context. Audio chunk `tsMs` is the time of the chunk's first sample (receive time minus 100 ms). Measure and document the audio/video offset; the sync detector searches a small lag range to absorb the rest.
- **Selectors:** all Meet and Gmail selectors live in `meet-config.ts` and `gmail-config.ts`.

## 4. Arbiter

Input: latest `AudioResult`, `SyncResult`, `FrameResult`, `ChallengeStatus`.
Output: `ArbiterOutput` (see master doc).

### Fusion
- `fusedScore = (wA * audio + wV * sync) / (wA + wV)`, using only signals whose `confidence` is above a threshold. Start at `wA = 0.5`, `wV = 0.5` and tune on labelled clips.
- Exponential moving average over about 10 s. Add hysteresis between states so the display does not flicker.
- If both signals are unavailable (no speech, no face), stay in `CLEAR` and show "not enough data" rather than guessing.

### State machine
| State | Enter when | Exit when |
|---|---|---|
| `CLEAR` | start, or score low for a while | `fusedScore` above the suspicious threshold for N seconds |
| `SUSPICIOUS` | threshold crossed | score drops (back to `CLEAR`) or above the challenge threshold |
| `CHALLENGE` | still suspicious after N seconds | verifier returns `passed` (drop back) or `failed` / high `artifactScore` (go to `ALERT`) |
| `ALERT` | challenge failed or very high score | user dismisses, or score stays low for a long time |

### Challenge flow
- Pick a challenge from a bank, avoid repeating the last one, and show the prompt to the **user** ("Ask the caller to turn their head left and right"). The user relays it to the caller.
- Call `ChallengeVerifier.start`, poll until `passed`, `failed`, or timeout (about 10 s).
- Use `artifactScore` as a strong input to the final decision.

### Logging
Every decision writes a JSONL line: timestamp, inputs, fused score, state, reasons. Roles 1 and 2 use these logs to debug, and you use them to tune weights and thresholds.

## 5. Alert UI

- **In-page overlay** injected into the Meet tab (use a shadow root so Meet's CSS cannot break it): traffic-light status, one-line reason, and the challenge prompt when needed.
- **High-risk alert:** a prominent modal-style banner. Optionally a system notification (`chrome.notifications`) and a short sound.
- **Toolbar popup (React):** Start / Stop, sensitivity setting, a plain "no data leaves your device" note, and a link to the decision log.
- Never block Meet's call controls or cover the video tiles. Keep the overlay draggable or collapsible.
- Accessible: do not rely on colour alone, include text labels.

## 6. Gmail banner

- Content script reads the open email (subject, body text, links with `href`, sender name and address) and builds an `EmailInput`.
- Call Audio Module's `TextClassifier.classify` and show a banner at the top of the email with the label and reasons.
- Only run on emails the user opens. Do not store or transmit email content.
- Cut-or-keep decision once the core demo path works.

## 7. Test harness

`apps/harness` is a local page that plays a video file (with audio) into the **same pipeline** as the extension. This lets everyone develop and test without joining Meet.
- Load a clip from `eval/clips`, run it through capture → detectors → arbiter, and show the state over time with a score chart.
- Option to replay a clip with different weights and thresholds, so tuning is quick.
- Export results as JSONL for the eval scripts.

## 8. Benchmarks (latency story for the paper and README)

- Log per-stage timings: capture, feature extraction, model, arbiter, overlay.
- Measure end-to-end time from a fake appearing to the state change.
- Record CPU, GPU, and memory while a call runs. Test with the extension on and off, and check that the call stays smooth.
- Compare settings: fps, window size, quantization (Roles 1 and 2 supply their latency tables).
- Put all numbers in one table in `docs/benchmarks.md`.

## 9. Milestones you run

You run the integration. Milestones are reached in order; there is no fixed schedule (master doc section 12).

| Milestone | You verify |
|---|---|
| M1 | Scaffold in place (Appendix A), contracts frozen, capture spike answered, mock-driven extension runs end to end |
| M2 | First handovers dropped in; real audio and real vision modules replace the stubs in the harness; self-test green |
| M3 | Full loop on the harness (score, state, challenge, alert), then on a live Meet call |
| M4 | Final handovers in; eval numbers and latency numbers collected; weights and thresholds tuned |
| M5 | Freeze: no new features, only bug fixes; release build, README, demo script, fallback ready |

## 10. Order of work for Full-Stack Integration

Follow the numbered generation order in Part B3 below. In short: scaffold from Appendix A (already includes contracts, mocks, stubs, scripts, minimal harness), arbiter, pipeline, extension shell, offscreen audio, Meet content script and overlay, harness, integrate real packages as they arrive, challenge UI and logging, Gmail banner (or cut), benchmarks and release.

## 11. Handoff checklist

- [ ] Extension loads unpacked and starts from the toolbar on Meet.
- [ ] All real modules integrated, mocks kept for testing.
- [ ] Arbiter thresholds and weights documented with the clips they were tuned on.
- [ ] JSONL logs working.
- [ ] Network tab check done: no audio, video, or email text leaves the machine.
- [ ] Minimum permissions in the manifest.
- [ ] Benchmarks table, demo script, README, demo video, public repo.

## 12. Things to ask other roles

- Audio Module: the audio chunk size they prefer, silence-gate behaviour, and the recommended threshold range.
- Vision Module: frame size and fps they need, and how they want the audio energy delivered.

## 13. Risks specific to you

| Risk | Mitigation |
|---|---|
| `tabCapture` and offscreen document quirks | First spike before anything else |
| Meet DOM changes break video selector | One config file, fallback to largest playing `<video>` |
| Frame transfer too slow | Lower fps or width, JPEG quality, drop frames while one is in flight |
| Audio/video timestamps drift | Shared clock, measure the offset, document it |
| Other roles blocked by you | Mocks and frozen contracts at M1 |
| Scope creep | Email and extra signals are cuttable; keep time in reserve before the freeze |

---

# PART B: BUILD SPEC (generation-ready)

Use this part to generate your code, whether by hand or with an AI tool. The shared designs and code (contracts, messages, build script, manifest, runtime wiring, pipeline, arbiter defaults, self-test, check scripts) are in the master doc; this part tells you **what to generate, in what order, and how to know it works.** Paste the master doc, this whole doc, and the prompt at the end into your code assistant.

## B1. What you deliver

```
package.json  pnpm-workspace.yaml  tsconfig.base.json  tsconfig.json  vitest.config.ts  .gitignore
scripts/build.mjs  scripts/serve.mjs  scripts/check-integration.mjs  scripts/check-privacy.mjs  scripts/privacy-allow.json
packages/contracts/   src/types.ts  src/messages.ts  src/selftest.ts  src/fixtures.ts  src/index.ts  tests/
packages/mocks/       src/index.ts  tests/
packages/arbiter/     src/index.ts  src/config.ts  src/fusion.ts  src/state.ts  tests/
packages/pipeline/    src/index.ts  src/rms.ts  tests/
packages/<5 role packages>/   STUBS (master doc 6.3) until real folders arrive
apps/extension/
  public/manifest.json  public/popup.html  public/offscreen.html  public/icons/*
  src/background/index.ts
  src/offscreen/index.ts  src/offscreen/audio-worklet.ts  src/offscreen/detectors.ts  src/offscreen/b64.ts
  src/content/meet.ts  src/content/meet-config.ts  src/content/overlay.ts  src/content/overlay.inline.css
  src/content/gmail.ts  src/content/gmail-config.ts
  src/popup/index.tsx  src/popup/popup.css  src/shared/clock.ts  src/shared/settings.ts
  src/types/worklet.d.ts
apps/harness/
  public/index.html  src/index.ts
docs/benchmarks.md  docs/demo-script.md  README.md
```

## B2. First spike (answer these before generating the real code; write the answers in `docs/spike-notes.md`)

| # | Question | How to check | If it fails |
|---|---|---|---|
| 1 | Does the popup Start button give a valid `getMediaStreamId` for the Meet tab? | Click Start on a live Meet | Try starting from the toolbar icon (`action.onClicked`) instead of the popup |
| 2 | Does an offscreen document with `USER_MEDIA` and `AUDIO_PLAYBACK` receive the stream and stay alive during a call? | Log audio chunk counts for 5 minutes | Check the offscreen reasons and lifetime rules in the current Chrome docs |
| 3 | Can the user still hear the call while the extension captures it? | Listen | Wire the playback `AudioContext` to the destination; check the mute behaviour of tab capture |
| 4 | Does an `AudioContext({ sampleRate: 16000 })` accept the tab stream and deliver 100 ms chunks? | Count samples per second (expect 16000) | Resample manually in the worklet |
| 5 | Does `chrome.runtime.connect` from the Meet content script reach the offscreen `onConnect`? | HELLO round trip | Route through the service worker |
| 6 | Can the content script read frames from the remote `<video>` (canvas not tainted) and encode JPEG? | `convertToBlob` works, size about 15-30 KB at 480 px | Fall back to `toDataURL` |
| 7 | JPEG base64 frames at 5 fps: end-to-end delay and CPU? | Measure encode, send, decode | Lower fps or width |
| 8 | Do `onnxruntime-web` and MediaPipe load their WASM from bundled extension files in the offscreen page? | Run a tiny model and a landmark call | Adjust asset paths or esbuild externals (master doc 7.1 notes) |
| 9 | Which video element is the remote caller in Meet, and how is the self-view mirrored? | Inspect the DOM | Use the manual "click the tile" fallback |

M1 requires all nine answered (or a known workaround) and shared with the team.

## B3. Generation order (the agent works through these in order; run `pnpm test` after each package and `pnpm verify` at the end)

1. **Scaffold:** create the Appendix A files, run `node scripts/make-stubs.mjs`, `pnpm install`, `pnpm verify:parts`, and commit the baseline tag. The scaffold already contains the contracts, fixtures, self-test, mocks, build and check scripts, stub role packages, and the minimal harness.
2. **`packages/arbiter`:** config, fusion, state machine, tests listed in master doc 9.2. Add its `package.json` (`@sentinel/arbiter`, dependency `@sentinel/contracts` as `workspace:*`).
3. **`packages/pipeline`:** per master doc 9.1, with tests using mocks and a fake clock (`@sentinel/pipeline`, dependencies on contracts and arbiter).
4. **Extension shell:** `apps/extension/package.json` (`@sentinel/extension`, `workspace:*` dependencies on contracts, pipeline, arbiter, mocks, and the five role packages), `public/manifest.json`, the two HTML shells, icons (generate three solid-colour PNGs with a small Node script using `node:zlib`, no dependency), `src/types/worklet.d.ts`, the service worker, and the popup (Start/Stop and state only). `pnpm build` must produce `apps/extension/dist`.
5. **Offscreen document:** audio capture, worklet, `detectors.ts` (real or mock per `settings.useMock`), pipeline wiring, port handling, `UPDATE` and `CHALLENGE` messages. Log chunk and frame counts.
6. **Meet content script:** video picking, frame loop with JPEG, port, overlay driven by updates. **First end-to-end demo with mocks.**
7. **Popup and settings:** complete the popup, store settings in `chrome.storage`, optional notification and sound.
8. **Challenge flow UI** (prompt, countdown, dismiss) and JSONL logging.
9. **Harness replay page:** add new files `apps/harness/public/replay.html` and `apps/harness/src/replay.ts` per B4 (clip replay, live view, export), and add the second entry to `scripts/build.mjs`'s harness list. Do not change the existing `index.html` or `src/index.ts`.
10. **Gmail content script and banner** (or skip if the decision input says so).
11. **Docs:** `docs/benchmarks.md` template, `docs/demo-script.md`, `docs/spike-notes.md` template (the questions in B2), `README.md`.
12. **Integrate real packages** as tarballs arrive (master doc 18.5), one at a time, running `pnpm verify` and the harness self-test after each.

## B4. Harness specification (`apps/harness`)

The scaffold already contains the **self-test page** (`apps/harness/public/index.html`, `src/index.ts`; do not edit those two files). You add a second page, `replay.html` with `src/replay.ts`, that lets anyone develop and test **without Meet**, using the same pipeline code as the extension. Its features:
- **Self-test (already in the scaffold):** the existing page builds all five modules, runs `runContractSelfTest`, shows a table and median latencies. Link to it from the replay page.
- **Run clip:** choose a video file with audio from disk. Play it in a `<video>` element. Feed audio into the pipeline by connecting the element to a 16 kHz `AudioContext` through `createMediaElementSource` and the same `chunker` worklet (bundle it as a harness entry); feed frames at 5 fps by drawing the video to a canvas, encoding JPEG, decoding back to `ImageBitmap` (so the same code path is exercised).
- **Live view:** per-module scores over time (simple canvas or SVG chart), arbiter state timeline, challenge prompts, and per-stage latency.
- **Controls:** per-module mock toggles, sensitivity, and live sliders for the arbiter weights and thresholds. **Re-run a clip with different settings** to tune quickly.
- **Export:** download the JSONL decision log and a CSV of per-update scores (used by Roles 1 and 2 for their eval reports and by you for tuning).
- Must work offline from `localhost` (assets served with the right MIME types by `serve.mjs`).

## B5. Tests you must write (vitest, node)

- `contracts`: the self-test passes for all mocks; fixtures return finite values in range.
- `mocks`: scripted curves follow the spec at known timestamps.
- `arbiter`: the six tests in master doc 9.2, plus: the fused score is `null` with no data, weights respond to `confidence`, sensitivity changes thresholds.
- `pipeline`: audio push order and drop counting, a frame leads to sync/challenge/arbiter calls, a challenge is started once on entering `CHALLENGE` and cancelled on leaving, logger output has the required fields.
- `check-integration` and `check-privacy`: run them against a fixture folder that contains one good package and one bad package (missing export, `fetch("https://…")`) and assert the exit codes.

## B6. Benchmarks (`docs/benchmarks.md`)

Template (fill with measured numbers on the demo laptop, with the extension on and off):
```
Machine: CPU / GPU / RAM / OS / Chrome version
| Stage | Median ms | p95 ms | Notes |
| JPEG encode (content script) | | | |
| JPEG decode (offscreen) | | | |
| Vision per frame | | | backend, frame width |
| Audio per window | | | backend, precision |
| Sync + arbiter per update | | | |
| End to end: fake appears -> state change | | | |
| CPU % / GPU % / memory MB with call + extension | | | |
| Call smoothness (dropped frames, audio glitches) | | | |
Settings compared: fps (3/5/8), frame width (320/480), audio window, int8 vs fp32.
```

## B7. Intake checklist for each role handover

- [ ] The tarball contains only the owner's folders (master doc section 2) and no README files.
- [ ] Stubs replaced, not merged; `pnpm install` succeeds.
- [ ] `pnpm verify` passes.
- [ ] Harness self-test is green for the delivered modules; latency numbers recorded in `docs/benchmarks.md`.
- [ ] `docs/audio-module/HANDOVER.md` and `docs/audio-module/MODEL_CARD.md`, thresholds, and known limitations read and used for the root `README.md`.
- [ ] Re-run a labelled clip in the harness and confirm the scores match the owner's eval within a small tolerance.

## B8. Acceptance criteria (you are done when all are true)

- [ ] `pnpm verify` passes on a fresh clone with all three folders in place.
- [ ] Harness self-test green for all five role modules.
- [ ] Extension loads unpacked and runs on a live 1-on-1 Meet call; the user can still hear the call.
- [ ] The overlay shows all four states, the challenge prompt with countdown, and the dismiss control; it never covers the call controls.
- [ ] A recorded fake clip reaches `ALERT`; a real clip stays `CLEAR` (numbers in `docs/benchmarks.md`).
- [ ] Gmail banner works on a sample phishing email, or the feature is explicitly cut.
- [ ] Network tab shows no uploads; `pnpm check:privacy` passes; manifest has only the permissions in master doc 7.3.
- [ ] Release zip, README with honest results, static page, demo video (master doc section 15).

## B9. Prompt for your code assistant

The prompt is in the **START HERE** block at the top of this document. Use that one.

---

# PART C: COMMANDS AND SNIPPETS (Full-Stack Integration)

The full command list (repo creation, install, build, load unpacked, debug views, integrating handovers, release) is in master doc section 18, and the reference code for `serve.mjs`, `check-integration.mjs`, and `check-privacy.mjs` is in master doc Appendix A. Below are the small shared helpers and the exact snippets the spike needs.

## C1. Shared helpers (`apps/extension/src/shared/`)
```ts
// clock.ts
export const nowMs = () => performance.timeOrigin + performance.now();

// b64.ts
export function bytesToB64(bytes: Uint8Array): string {
  let s = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}
export function b64ToBlob(b64: string, type = "image/jpeg"): Blob {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
```
```ts
// packages/pipeline/src/rms.ts
export function rms(chunk: Float32Array): number {
  let s = 0; for (let i = 0; i < chunk.length; i++) s += chunk[i] * chunk[i];
  return Math.sqrt(s / Math.max(1, chunk.length));
}
```

## C2. Meet content script: encode and send one frame
```ts
const w = Math.min(FRAME_MAX_WIDTH, video.videoWidth);
const h = Math.round((video.videoHeight / video.videoWidth) * w);
const off = new OffscreenCanvas(w, h);
off.getContext("2d")!.drawImage(video, 0, 0, w, h);
const blob = await off.convertToBlob({ type: "image/jpeg", quality: 0.7 });
const jpegB64 = bytesToB64(new Uint8Array(await blob.arrayBuffer()));
port.postMessage({ v: 1, t: "FRAME", jpegB64, w, h, tsMs: nowMs() } satisfies ContentToOffscreen);
```
Offscreen side: `const bmp = await createImageBitmap(b64ToBlob(msg.jpegB64)); await pipeline.pushFrame(bmp, msg.tsMs); bmp.close();`

## C3. Spike probes (log these and write the results in `docs/spike-notes.md`)
```ts
// offscreen: count audio chunks per second (expect 10 chunks of 1600 samples per second at 16 kHz)
let n = 0; setInterval(() => { console.log("audio chunks/s", n); n = 0; }, 1000);
node.port.onmessage = (e) => { n++; /* then push to pipeline */ };

// content script: round trip over the port
const port = chrome.runtime.connect({ name: PORT_MEET });
port.onMessage.addListener((m) => console.log("from offscreen", m));
port.postMessage({ v: 1, t: "HELLO" });

// content script: time one JPEG encode
const t0 = performance.now(); /* encode as in C2 */ console.log("encode ms", performance.now() - t0);
```

## C4. Release and handover intake
Master doc sections 18.5 (integrate a handover) and 18.7 (release build). Keep the self-test screenshot for every handover in `docs/handovers/`.
