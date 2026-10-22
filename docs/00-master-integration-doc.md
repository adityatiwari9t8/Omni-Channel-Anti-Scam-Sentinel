# MASTER DOC (v2): Omni-Channel Anti-Scam Sentinel

This is the single source of truth. **If a role doc disagrees with this doc, this doc wins.** Version 2 replaces the earlier master and the solo-builder spec.

The goal of v2: each of the three people can generate their own part (with an AI tool or by hand) from this doc plus their role doc, and then **the three folders are copied together into one repo and build with no edits.** Everything that makes that work (folder names, exported function names, file formats, message formats, build rules, tests) is defined here.

Document set:
- `00-master-integration-doc.md` (this file): everyone reads all of it
- `01-audio-module-ml-audio.md`: Audio Module also reads this
- `computer-vision.md`: Vision Module also reads this
- `fullstack-extension.md`: Full-Stack Integration also reads this

Names: Audio Module is Utkarsh, Vision Module is Yash, Full-Stack Integration is Aditya.

## 0. How the work flows (read this first)

People: **Audio Module = Utkarsh** (audio and text), **Vision Module = Yash** (vision), **Full-Stack Integration = Aditya** (full stack and integration). There is **one repository**, built in three phases. Each person generates their part with a coding agent (Claude Code, a Cursor agent, or similar) that can run shell commands. These documents contain the prompt, the shared starter files, the commands, and the checks.

**Phase 1: build your part separately (no shared repo yet).**
1. Make an empty folder. Put **two files** in a `docs/` folder inside it: `00-master-integration-doc.md` (this file) and your own role doc (`01-...` Utkarsh, `02-...` Yash, `03-...` Aditya).
2. Open your agent in that folder and allow it to run commands.
3. Open your role doc. At the top is a **START HERE** block with optional inputs and **one prompt to paste**. Paste it, and nothing else.
4. The agent creates the shared scaffold from Appendix A, generates your part, runs the tests and checks, and packs your folders into `audio-module-<date>.tgz` or `vision-module-<date>.tgz`. Read its final report and do the "human steps" it lists.
5. Utkarsh and Yash **send their tarballs to Aditya**. They do not create a repository.

**Phase 2: Aditya integrates and builds the full stack.**
1. Aditya unpacks both tarballs into his project (section 18.5), then builds the full stack with the rest of his role doc (arbiter, pipeline, Chrome extension, overlay, popup, Gmail banner, benchmarks).
2. Aditya writes the **single root `README.md`** and pushes the whole project to GitHub (section 18.8), then adds Utkarsh and Yash as collaborators.

**Phase 3: everyone works in the one GitHub repository.**
1. Utkarsh and Yash **clone the repository** (section 18.8), run `pnpm install` and `pnpm verify`.
2. Each works on their own branch (`audio-module/<topic>`, `vision-module/<topic>`) and only inside their own folders, runs `node scripts/check-ownership.mjs <role>`, pushes, and opens a pull request. Aditya reviews and merges.

**Why there are no merge conflicts:** the three parts live in different folders (section 2). Everyone's agent builds the same scaffold from the same text, but only the owned folders are delivered. `node scripts/check-ownership.mjs <role>` fails if anything outside your folders changed, or if you created a README. `pnpm-lock.yaml` is git-ignored, and each person writes their own labels file.

**Documentation rule:** the repository has **one README**, at the root, owned by Aditya. Role packages have **no README**. Utkarsh and Yash write their notes in `docs/audio-module/` and `docs/vision-module/` (`HANDOVER.md` and `MODEL_CARD.md`, section 17.5).

## Contents
0. How the work flows (read this first)
1. What we are building
2. Roles, ownership, and the drop-in rules
3. Architecture and runtime flow
4. Shared contracts (full source)
5. Repository layout and workspace config
6. Package template and asset declaration
7. Build system and manifest
8. Extension runtime wiring (service worker, offscreen, content scripts)
9. Pipeline and arbiter specification
10. Model decision records, test data, evaluation
11. Integration procedure, self-test, and check scripts
12. Build order and milestones
13. Performance budgets, privacy, risks
14. Demo
15. Deployment
16. Open questions and definition of done
17. Agent rules, final report, and handover checklist
18. Commands cheat sheet
Appendix A. Scaffold files (canonical source, tested)

---

## 1. What we are building

A Chrome extension that watches a live Google Meet call and warns the user if the other person's voice or face looks AI-generated. It also runs one small phishing-text check on Gmail. All detection runs inside the browser, so no audio, video, or email text leaves the machine.

**Purpose:** portfolio piece (MAANG-style hiring) and hackathon entry, with a research angle (low-latency on-device detection).
**Deadline:** short hackathon timeline. Confirm the exact date; the work is ordered by the milestones in section 12, not by a day-by-day schedule.

### 1.1 Locked decisions
| Area | Decision |
|---|---|
| Inference | Fully in the browser: ONNX Runtime Web (WASM, WebGPU if it works), MediaPipe tasks (WASM/GPU) |
| Stack | TypeScript, esbuild, React (popup only), Chrome Manifest V3, pnpm workspaces |
| Call platform | Google Meet only (ASSUMPTION, confirm) |
| Arbiter | Rule-based fusion, state machine, scripted challenges, no LLM (ASSUMPTION, confirm) |
| Alert | In-page overlay on the Meet tab, optional system notification and sound (ASSUMPTION, confirm) |
| Email | Minimal Gmail phishing-text check, cut first if behind. The classifier is plain TypeScript and runs in the Gmail content script |
| Experiments | GPU laptop or Google Colab |
| Node | Node 20.11 or newer (the build script uses `import.meta.dirname`) |

### 1.2 Non-goals
Desktop Zoom or Teams apps, other browsers, mobile, server-side inference, an on-device LLM, training from scratch unless the first model-selection spike forces it, anything not on the demo path.

### 1.3 Corrections to earlier docs (read these)
- Chrome extension messaging serializes messages as JSON, so an `ImageBitmap` or `ArrayBuffer` **cannot** be passed from the content script to the offscreen document directly. Frames travel as **base64 JPEG** and the pipeline decodes them back to `ImageBitmap` before calling Vision Module's code. Vision Module still receives an `ImageBitmap`. (Verify in the first spike; if your Chrome version supports structured-clone messaging, keep JPEG anyway for consistency.)
- The default Manifest V3 extension-page CSP already allows WebAssembly (`wasm-unsafe-eval`). Do not weaken it.
- Web Workers are **optional**. The offscreen document is a hidden page separate from the Meet tab, so heavy inference there cannot freeze the call UI. Start on its main thread, add a worker only if you measure problems.
- At 10 frames per second (100 ms per frame) the lip-sync check sees mouth open/close at roughly word level. It **cannot** reliably see short sounds such as a "P" lip closure. Do not claim phoneme-level lip-sync detection; report this limit.
- Model files live **inside each role's package folder** (`assets/`), not in a root `models/` folder, so one folder carries everything.

---

## 2. Roles, ownership, and the drop-in rules

| Role | Owner | Owns (only these paths) |
|---|---|---|
| Audio Module: ML (audio + text) | Utkarsh | `packages/audio-detector/`, `packages/text-classifier/`, `colab/audio/`, `colab/text/`, `eval/audio/`, `eval/text/`, `eval/clips/labels/audio-eval.csv`, `docs/audio-module/` |
| Vision Module: Computer Vision | Yash | `packages/vision-detector/`, `packages/sync-detector/`, `packages/challenge-verifier/`, `colab/vision/`, `eval/vision/`, `eval/clips/labels/vision-eval.csv`, `docs/vision-module/` |
| Full-Stack Integration: Full-stack + integration | Aditya | the root `README.md` (the only README), everything else: root config files, `packages/contracts/`, `packages/mocks/`, `packages/pipeline/`, `packages/arbiter/`, `apps/`, `scripts/`, `docs/` (except role subfolders) |

### 2.1 The drop-in rules (all three must follow)
1. **Only edit files you own.** Need a change elsewhere? Ask the owner.
2. **Your package folder is self-contained.** It carries its own source, tests, `package.json`, model files (`assets/`), and `sentinel.assets.json`. Copying the folder is a complete delivery. **No README inside role packages or anywhere in your folders** (the repository has one root README, written by Aditya). Your notes go in `docs/audio-module/HANDOVER.md` and `docs/audio-module/MODEL_CARD.md` (section 17.5).
3. **Exported names are fixed** (table in 2.2). Do not rename them.
4. **Implement only the interfaces in `@sentinel/contracts`.** Do not import from other roles' packages. Do not change the contracts. If a contract must change, all three owners agree and Full-Stack Integration edits it.
   Scaffold changes: the contracts, fixtures, self-test, and mocks change only with all three owners' agreement (and a new master doc version). Full-Stack Integration may add new files to the scaffold (for example the harness replay page) and may extend `scripts/build.mjs`'s entry list; Roles 1 and 2 never need those, because they deliver only their own folders.
5. **No network calls.** No `fetch` to `http(s)` URLs, no `WebSocket`, no `XMLHttpRequest`, no `sendBeacon`. Load files only from `assetBase`. `pnpm check:privacy` fails the build otherwise.
6. **Pin dependency versions** in your package's `package.json` (exact versions, no `^`) and record them in `docs/audio-module/HANDOVER.md`. Do not edit the root `package.json`.
7. **Each package must pass `pnpm verify:parts` and the browser self-test** (section 11) before you hand it over. `node scripts/check-ownership.mjs <your role>` must pass too.
8. **Large files** (models) go in `assets/`. In Phase 1 they travel inside your tarball. Once the project is on GitHub they are committed like any file: keep each under 50 MB (GitHub blocks files over 100 MB); for bigger files use Git LFS (section 18.8). Record the file names and sizes in `docs/audio-module/MODEL_CARD.md`. Audio and video **clips** are not committed; share them by drive link.
9. **Handover format (Phase 1):** a `.tgz` of your owned folders, named `role<N>-<yyyymmdd>.tgz`, made with the commands in section 18.4. It already contains your `docs/audio-module/` notes. Send it to Aditya, who replaces the stub folders with yours (section 18.5). In Phase 3 there are no tarballs: you push branches and open pull requests.

### 2.2 Fixed package names and exports

| Folder | npm name | Required export | Returns |
|---|---|---|---|
| `packages/audio-detector` | `@sentinel/audio-detector` | `createAudioDetector()` | `AudioDetector` |
| `packages/text-classifier` | `@sentinel/text-classifier` | `createTextClassifier()` | `TextClassifier` |
| `packages/vision-detector` | `@sentinel/vision-detector` | `createVisionDetector()` | `VisionDetector` |
| `packages/sync-detector` | `@sentinel/sync-detector` | `createSyncDetector()` | `SyncDetector` |
| `packages/challenge-verifier` | `@sentinel/challenge-verifier` | `createChallengeVerifier()` | `ChallengeVerifier` |
| `packages/mocks` | `@sentinel/mocks` | `mockAudioDetector()`, `mockVisionDetector()`, `mockSyncDetector()`, `mockChallengeVerifier()`, `mockTextClassifier()` | the matching interfaces |
| `packages/arbiter` | `@sentinel/arbiter` | `createArbiter(cfg?)` | `Arbiter` |
| `packages/pipeline` | `@sentinel/pipeline` | `createPipeline(deps, opts?)` | `Pipeline` |

Each package's `src/index.ts` must export its create function(s) by name. `node scripts/make-stubs.mjs` creates **stub** versions of the five role packages (each just re-exports the mock), so the workspace builds before real code exists. Real packages **replace the stub folders entirely.**

---

## 3. Architecture and runtime flow

```
Meet tab (https://meet.google.com)
 └─ content-meet.js
      • finds the remote <video>, samples about 10 fps, downscales, encodes JPEG
      • opens ONE port to the offscreen document ("sentinel-meet")
      • sends FRAME messages, receives UPDATE / CHALLENGE messages, draws the overlay (shadow DOM)

Service worker (background.js)  — lifecycle only
 • popup "Start" → chrome.tabCapture.getMediaStreamId → create offscreen document → OFFSCREEN_START
 • stores run state in chrome.storage.session

Offscreen document (offscreen.html + offscreen.js) — all inference lives here
 • getUserMedia with the tab stream id → two AudioContexts:
     playback (default rate → speakers, so the user still hears the call)
     analysis (16 kHz → AudioWorklet "chunker" → 100 ms mono Float32 chunks)
 • Pipeline: audio chunks + decoded frames → AudioDetector, VisionDetector, SyncDetector,
   ChallengeVerifier → Arbiter → UPDATE messages back through the port

Gmail tab (https://mail.google.com)
 └─ content-gmail.js
      • reads the open email, runs TextClassifier directly in the content script (plain TS, no WASM)
      • draws a banner at the top of the email
```

Verify in the first spike, before writing real code (Full-Stack Integration leads):
- `chrome.tabCapture.getMediaStreamId` needs a user gesture (opening the popup and pressing Start counts as invoking the extension; confirm). It cannot start silently.
- Offscreen documents need the `USER_MEDIA` reason, and `AUDIO_PLAYBACK` if the document plays the call audio back. Check the current Chrome docs for reason names and any auto-close rules.
- `AudioContext` may start suspended; call `resume()` after the stream is attached.

---

## 4. Shared contracts (full source)

Lives in `packages/contracts/src/`. **Frozen at milestone M1.** After that, a change needs all three owners.

### 4.1 `packages/contracts/src/types.ts`

```ts
/** All timestamps: milliseconds on one shared clock = performance.timeOrigin + performance.now(). */
export type Ms = number;
/** 0 = looks real, 1 = looks fake. */
export type Score01 = number;

export const SAMPLE_RATE = 16000;          // analysis audio, mono
export const AUDIO_CHUNK_MS = 100;         // pipeline pushes 100 ms chunks (1600 samples)
export const FRAME_FPS = 10;               // video frames per second sent to the pipeline (the pipeline drops frames when busy)
export const FRAME_MAX_WIDTH = 480;        // px, aspect ratio kept

/** URL prefix that ends with "/", e.g. chrome.runtime.getURL("") in the extension, "/" in the harness. */
export interface InitOptions {
  assetBase: string;
  preferWebGPU?: boolean;   // detectors fall back to WASM/CPU if unavailable
}

/** Where assets are placed in dist (see sentinel.assets.json in each package). */
export const ASSET_PATHS = {
  audioModelDir: "models/audio/",   // model.onnx + meta.json (Audio Module)
  visionModelDir: "models/vision/", // face_landmarker.task (+ optional hand_landmarker.task) (Vision Module)
  ortDir: "ort/",                   // onnxruntime-web .wasm/.mjs files (Audio Module)
  mediapipeWasmDir: "mediapipe/wasm/", // @mediapipe/tasks-vision wasm files (Vision Module)
} as const;

// ---------- Audio Module: audio ----------
export interface AudioResult {
  windowStartMs: Ms;
  windowEndMs: Ms;
  scoreFake: Score01;
  confidence: Score01;    // 0 for silent or unusable windows
  latencyMs: number;      // inference time for this window
}
export interface AudioDetector {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  init(opts: InitOptions): Promise<void>;
  /** chunk: mono Float32 PCM at 16 kHz, values in [-1, 1]. tsMs = time of the FIRST sample. Returns a result when a hop completes, else null. */
  push(chunk: Float32Array, tsMs: Ms): Promise<AudioResult | null>;
  dispose(): void;        // safe to call twice
}

// ---------- Audio Module: text ----------
export interface EmailInput {
  subject: string;
  bodyText: string;
  links: { text: string; href: string }[];
  senderName: string;
  senderAddress: string;
  replyTo?: string;
}
export interface TextResult {
  risk: Score01;
  label: "safe" | "suspicious" | "phishing";
  reasons: string[];       // short plain-language strings shown in the banner
  latencyMs: number;
}
export interface TextClassifier {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  init(opts: InitOptions): Promise<void>;
  classify(e: EmailInput): Promise<TextResult>;
}

// ---------- Vision Module: vision ----------
export interface FrameResult {
  tsMs: Ms;
  faceFound: boolean;
  mouthAperture: number;   // inner-lip gap / face height, about 0..0.5; 0 if no face
  headPose: { yawDeg: number; pitchDeg: number; rollDeg: number };
  faceOccluded: boolean;   // face or mouth mostly hidden
  landmarkQuality: Score01;// 1 = stable, confident landmarks
  handNearFace: boolean;   // false if hands are not tracked
  latencyMs: number;
}
export interface VisionDetector {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  init(opts: InitOptions): Promise<void>;
  processFrame(frame: ImageBitmap, tsMs: Ms): Promise<FrameResult>;
  dispose(): void;
}

export interface SyncResult {
  tsMs: Ms;
  scoreFake: Score01;
  confidence: Score01;
  correlation: number;     // best Pearson r over the lag search
  windowMs: number;
}
export interface SyncDetector {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  pushAudioEnergy(rms: number, tsMs: Ms): void;   // one call per 100 ms chunk, from the pipeline
  pushFrame(r: FrameResult): void;
  getSync(): SyncResult | null;                    // null until enough speech has been seen
  reset(): void;
}

export type ChallengeType = "turn_head_left_right" | "cover_half_face" | "raise_fingers";
export interface ChallengeStatus {
  challenge: ChallengeType;
  state: "pending" | "passed" | "failed";
  artifactScore: Score01;  // 0 = face stayed clean, 1 = obvious breakdown
  evidence: string;        // short human-readable string for the overlay
}
export interface ChallengeVerifier {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  init(opts: InitOptions): Promise<void>;
  start(c: ChallengeType, tsMs: Ms): void;
  pushFrame(r: FrameResult): void;
  poll(): ChallengeStatus | null;                  // null if no challenge is active
  cancel(): void;
}

// ---------- Full-Stack Integration: arbiter ----------
export type ArbiterState = "CLEAR" | "SUSPICIOUS" | "CHALLENGE" | "ALERT";
export interface ArbiterOutput {
  tsMs: Ms;
  state: ArbiterState;
  fusedScore: Score01 | null;     // null when there is not enough data
  reasons: string[];
  challenge?: ChallengeType;      // set while state is CHALLENGE
  challengeDeadlineMs?: Ms;
}

// ---------- Settings ----------
export type Sensitivity = "low" | "medium" | "high";
export interface Settings {
  sensitivity: Sensitivity;
  notifications: boolean;
  sound: boolean;
  /** true = use the mock instead of the real module, per module (for debugging and fallbacks) */
  useMock: { audio: boolean; vision: boolean; sync: boolean; challenge: boolean };
}
export const DEFAULT_SETTINGS: Settings = {
  sensitivity: "medium",
  notifications: false,
  sound: false,
  useMock: { audio: false, vision: false, sync: false, challenge: false },
};
```

### 4.2 `packages/contracts/src/messages.ts` (the only message formats allowed)

```ts
import type { ArbiterOutput, AudioResult, ChallengeType, FrameResult, Ms, Settings, SyncResult } from "./types";

export const PORT_MEET = "sentinel-meet";

/** popup -> service worker (chrome.runtime.sendMessage). Always include v: 1. */
export type PopupToSw =
  | { v: 1; t: "START"; tabId: number }
  | { v: 1; t: "STOP" }
  | { v: 1; t: "GET_STATE" }
  | { v: 1; t: "SET_SETTINGS"; settings: Settings };
export interface SwState { running: boolean; tabId: number | null; settings: Settings; error?: string }

/** service worker -> offscreen document (chrome.runtime.sendMessage, target must be "offscreen"). */
export type SwToOffscreen =
  | { v: 1; target: "offscreen"; t: "OFFSCREEN_START"; streamId: string; settings: Settings }
  | { v: 1; target: "offscreen"; t: "OFFSCREEN_STOP" }
  | { v: 1; target: "offscreen"; t: "SETTINGS"; settings: Settings };

/** service worker -> Meet content script (chrome.tabs.sendMessage). */
export type SwToContent =
  | { v: 1; t: "MEET_START"; settings: Settings }
  | { v: 1; t: "MEET_STOP" };

/** Meet content script -> offscreen, over the port named PORT_MEET. */
export type ContentToOffscreen =
  | { v: 1; t: "HELLO" }
  | { v: 1; t: "FRAME"; jpegB64: string; w: number; h: number; tsMs: Ms }
  | { v: 1; t: "VIDEO_LOST" }
  | { v: 1; t: "USER_DISMISS" };

/** offscreen -> Meet content script, over the same port. */
export type OffscreenToContent =
  | { v: 1; t: "UPDATE"; out: ArbiterOutput; audio: AudioResult | null; sync: SyncResult | null; frame: FrameResult | null }
  | { v: 1; t: "CHALLENGE"; challenge: ChallengeType; prompt: string; deadlineMs: Ms }
  | { v: 1; t: "STATUS"; running: boolean; note?: string };

export const CHALLENGE_PROMPTS: Record<ChallengeType, string> = {
  turn_head_left_right: "Ask the caller to slowly turn their head left, then right.",
  cover_half_face: "Ask the caller to cover half of their face with their hand.",
  raise_fingers: "Ask the caller to hold up three fingers next to their face.",
};
```

### 4.3 `packages/contracts/src/index.ts` (the other contract files, `util.ts`, `fixtures.ts`, `selftest.ts`, are in Appendix A)
```ts
export * from "./types";
export * from "./messages";
export * from "./util";
export * from "./fixtures";
export * from "./selftest";
```

### 4.4 Rules for scores
- Every score and confidence is a finite number in `[0, 1]`. Never `NaN` or `Infinity`.
- No face, no speech, or no data means `confidence: 0` or a `null` result, **never a guess**.
- Every result that has `latencyMs` must report real measured time.

---

## 5. Repository layout and workspace config

```
sentinel/
  package.json            pnpm-workspace.yaml     tsconfig.base.json     tsconfig.json
  vitest.config.ts        .gitignore              .gitattributes (Git LFS rules, optional)
  scripts/
    build.mjs   serve.mjs   check-integration.mjs   check-privacy.mjs   check-ownership.mjs   make-stubs.mjs
  packages/
    contracts/            (Full-Stack Integration)  source in Appendix A
    mocks/                (Full-Stack Integration)  source in Appendix A
    pipeline/             (Full-Stack Integration)
    arbiter/              (Full-Stack Integration)
    audio-detector/       (Audio Module)  stub until Audio Module's folder replaces it
    text-classifier/      (Audio Module)  stub until replaced
    vision-detector/      (Vision Module)  stub until replaced
    sync-detector/        (Vision Module)  stub until replaced
    challenge-verifier/   (Vision Module)  stub until replaced
  apps/
    extension/            (Full-Stack Integration)  src/background, src/content, src/offscreen, src/popup, public/
    harness/              (Full-Stack Integration)  local page that runs the pipeline on a video file + self-test button
  colab/   audio/ text/ vision/     (Audio Module / Vision Module notebooks and export scripts, NOT part of the build)
  eval/    audio/ text/ vision/ clips/{labels/audio-eval.csv, labels/vision-eval.csv}
  docs/    00-master... 01-... 02-... 03-...
```

### 5.1 Workspace config files
The canonical, tested source of `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`, and `.gitignore` is in **Appendix A**. Dev tools are pinned to exact versions there (TypeScript, esbuild, vitest, React for the popup, and the Chrome types). Do not change them.

Notes:
- Node tests (`vitest`) cover **pure logic** only (feature math, correlation, arbiter, text rules, mocks). Anything that needs a browser (ONNX inference, MediaPipe, AudioContext) is tested by the **browser self-test** in the harness (section 11).
- `apps/extension/src/types/worklet.d.ts` declares the AudioWorklet globals (`AudioWorkletProcessor`, `registerProcessor`, `sampleRate`, `currentTime`), because the DOM lib does not include them.
- `pnpm-lock.yaml` is git-ignored during the three-way build so that each person's dependency installs cannot conflict. Full-Stack Integration may commit a lock file after everything is integrated.
- Model and clip files are shared by tarball or Git LFS, never plain git.

---

## 6. Package template and asset declaration

Every package under `packages/` follows this shape. A role package is complete when it has all of these. **There is no README in a package**; notes live in `docs/audio-module/` (section 17.5), outside the package.

```
packages/<name>/
  package.json
  sentinel.assets.json   files to copy into the extension dist
  src/index.ts           exports the create function(s) from section 2.2
  src/...                implementation
  tests/*.test.ts        pure-logic tests (vitest, node)
  assets/                model files and other binaries (not committed to git)
```

### 6.1 `package.json` template (example: audio detector)
```json
{
  "name": "@sentinel/audio-detector",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@sentinel/contracts": "workspace:*",
    "onnxruntime-web": "PIN-THE-EXACT-VERSION-YOU-TESTED"
  }
}
```
Packages are shipped as **TypeScript source** (no per-package build). esbuild and vitest read `src/index.ts` directly.

### 6.2 `sentinel.assets.json`
Tells the root build what to copy into the extension `dist/` (or `apps/harness/dist/`).
```json
{
  "assets": [
    { "from": "assets", "to": "models/audio" },
    { "from": "node_modules:onnxruntime-web/dist", "to": "ort", "match": "\\.(wasm|mjs)$" }
  ]
}
```
- `from` is a path relative to the package folder, or `node_modules:<package>/<subpath>` (resolved by walking up `node_modules`).
- `to` is relative to `dist`. If `from` is a folder, its contents are copied into `to`. If `from` is a file, `to` is the destination file path.
- `match` (optional) is a regular expression tested against file names.
- Destination paths must match `ASSET_PATHS` in the contracts so other code finds them.

### 6.3 Stub packages (created by `node scripts/make-stubs.mjs`, source in Appendix A)
```ts
// packages/audio-detector/src/index.ts
import { mockAudioDetector } from "@sentinel/mocks";
import type { AudioDetector } from "@sentinel/contracts";
export function createAudioDetector(): AudioDetector { return mockAudioDetector(); }
```
The stub's `package.json` depends on `@sentinel/contracts` and `@sentinel/mocks` only, and its `sentinel.assets.json` is `{ "assets": [] }`. **The real package folder replaces the stub folder completely**, including `package.json`.

### 6.4 `packages/mocks` behavior
Scripted, deterministic mocks so the whole extension runs before real models exist:
- `mockAudioDetector`: returns a result every 2000 ms. `scoreFake` follows a script over time: 0.10 for 0-20 s, ramps to 0.80 by 30 s, stays 0.80 until 50 s, then back to 0.10. `confidence` 0.9.
- `mockSyncDetector`: same script, offset by 3 s.
- `mockVisionDetector`: `faceFound: true`, `mouthAperture` = a slow sine wave, `headPose` follows the challenge if one is active, else small noise.
- `mockChallengeVerifier`: reports `passed` after 4 s, or `failed` if the script is in its high phase.
- `mockTextClassifier`: `phishing` if the body contains "verify your account" or "urgent", else `safe`.
Mocks must pass the same self-test as the real modules.

---

## 7. Build system and manifest

Owner: Full-Stack Integration. One script builds everything with esbuild: `scripts/build.mjs`.

### 7.1 `scripts/build.mjs`
The canonical, tested source of `scripts/build.mjs` is in Appendix A. It builds the extension (`pnpm build`) or the harness (`pnpm build:harness`), copies every package's declared assets, and bundles each entry point with esbuild.
Notes:
- The extension entry files listed in `scripts/build.mjs` are created by Full-Stack Integration; Roles 1 and 2 only run the harness build (`pnpm build:harness`).
- CSS imported by the popup becomes `popup.css`. CSS for the content-script overlay must be named `*.inline.css`; it is imported as a string and injected into the shadow root.
- Bundling `onnxruntime-web` with esbuild can be fiddly because it loads its `.wasm` and `.mjs` files at runtime. The rule: set `ort.env.wasm.wasmPaths = assetBase + "ort/"` and copy the files with `sentinel.assets.json` as shown. If esbuild fails on it, Audio Module marks `onnxruntime-web` as external in a small esbuild plugin proposal to Full-Stack Integration, or loads the pre-built ORT bundle via a dynamic `import(assetBase + "ort/<file>.mjs")`. **Decide this in the first spike.**
- Multi-threaded WASM needs cross-origin isolation; default to `ort.env.wasm.numThreads = 1` unless Audio Module measures a real gain and Full-Stack Integration adds the manifest isolation keys.

### 7.2 `scripts/serve.mjs`
A 20-line static file server (Node `http`) that serves a folder on a port, with correct MIME types for `.wasm`, `.mjs`, `.js`, `.onnx`, `.task`, `.json`, `.html`. Needed because the harness cannot load WASM from `file://`.

### 7.3 `apps/extension/public/manifest.json`
```json
{
  "manifest_version": 3,
  "name": "Sentinel: Deepfake and Scam Shield",
  "version": "0.1.0",
  "description": "Warns you if the person on a Google Meet call may be an AI-generated voice or face, and flags phishing emails. Everything runs on your device.",
  "minimum_chrome_version": "116",
  "permissions": ["tabCapture", "offscreen", "activeTab", "storage", "notifications"],
  "host_permissions": ["https://meet.google.com/*", "https://mail.google.com/*"],
  "action": { "default_popup": "popup.html", "default_title": "Sentinel" },
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    { "matches": ["https://meet.google.com/*"], "js": ["content-meet.js"], "run_at": "document_idle" },
    { "matches": ["https://mail.google.com/*"], "js": ["content-gmail.js"], "run_at": "document_idle" }
  ],
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
}
```
Add placeholder icons to `public/icons/`. Do not add permissions without telling the team; every permission needs a Web Store justification (section 15).

### 7.4 HTML shells (in `apps/extension/public/`)
- `popup.html`: `<div id="root"></div><link rel="stylesheet" href="popup.css"><script type="module" src="popup.js"></script>`
- `offscreen.html`: `<!doctype html><title>Sentinel offscreen</title><script type="module" src="offscreen.js"></script>`

---

## 8. Extension runtime wiring (Full-Stack Integration)

### 8.1 Service worker `apps/extension/src/background/index.ts`
Responsibilities: start and stop monitoring, own the offscreen document, hold run state in `chrome.storage.session`, and show notifications when asked. It does not process audio or video.

```ts
chrome.runtime.onMessage.addListener((msg: PopupToSw | { target?: string }, _s, sendResponse) => {
  if ((msg as any).target) return;                    // messages for the offscreen document
  const m = msg as PopupToSw;
  if (m.t === "START") { start(m.tabId).then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: String(e) })); return true; }
  if (m.t === "STOP")  { stop().then(() => sendResponse({ ok: true })); return true; }
  if (m.t === "GET_STATE") { getState().then(sendResponse); return true; }
  if (m.t === "SET_SETTINGS") { saveSettings(m.settings).then(() => sendResponse({ ok: true })); return true; }
});

async function start(tabId: number) {
  const settings = await loadSettings();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await ensureOffscreen();
  await chrome.runtime.sendMessage({ v: 1, target: "offscreen", t: "OFFSCREEN_START", streamId, settings });
  await chrome.tabs.sendMessage(tabId, { v: 1, t: "MEET_START", settings });
  await chrome.storage.session.set({ running: true, tabId });
}
async function ensureOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT" as any] });
  if (ctx.length) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"] as any,
    justification: "Analyze call audio and video on-device and play the call audio back.",
  });
}
```
Also: on `chrome.tabs.onRemoved` or `onUpdated` (navigated away) for the monitored tab, call `stop()`.

### 8.2 Offscreen document `apps/extension/src/offscreen/index.ts`
1. Listen for `OFFSCREEN_START`: build settings-aware detectors (real or mock per `settings.useMock`), create the pipeline, `await pipeline.start({ assetBase: chrome.runtime.getURL("") })`.
2. Start audio:
```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } } as any,
  video: false,
});
const playCtx = new AudioContext();                         // default rate: the user keeps hearing the call
playCtx.createMediaStreamSource(stream).connect(playCtx.destination);
await playCtx.resume();
const anaCtx = new AudioContext({ sampleRate: 16000 });     // analysis copy
await anaCtx.audioWorklet.addModule(chrome.runtime.getURL("audio-worklet.js"));
const node = new AudioWorkletNode(anaCtx, "chunker", { numberOfInputs: 1, numberOfOutputs: 0 });
node.port.onmessage = (e) => pipeline.pushAudio(e.data as Float32Array, nowMs() - AUDIO_CHUNK_MS);
anaCtx.createMediaStreamSource(stream).connect(node);
await anaCtx.resume();
```
3. `chrome.runtime.onConnect`: accept the port named `PORT_MEET`. On `FRAME`: decode to `ImageBitmap` (`createImageBitmap(await b64ToBlob(jpegB64))`) and call `pipeline.pushFrame(bitmap, tsMs)`, then `bitmap.close()`. Drop a frame if the previous one is still processing (never queue). Subscribe to pipeline updates and `port.postMessage` an `UPDATE` (rate limited to 4 per second) and `CHALLENGE` when the arbiter enters `CHALLENGE`.
4. On `OFFSCREEN_STOP`: stop tracks, close both `AudioContext`s, `dispose()` detectors, close the port.

`audio-worklet.ts`:
```ts
class Chunker extends AudioWorkletProcessor {
  private buf = new Float32Array(1600); private n = 0;       // 100 ms at 16 kHz
  process(inputs: Float32Array[][]) {
    const chs = inputs[0]; if (!chs || !chs.length) return true;
    for (let i = 0; i < chs[0].length; i++) {
      let s = 0; for (let c = 0; c < chs.length; c++) s += chs[c][i]; // downmix to mono
      this.buf[this.n++] = s / chs.length;
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor("chunker", Chunker);
```
`nowMs()` is `performance.timeOrigin + performance.now()` and lives in contracts or a tiny shared util in the extension app.

### 8.3 Meet content script `apps/extension/src/content/meet.ts`
- On `MEET_START`: open `chrome.runtime.connect({ name: PORT_MEET })`, send `HELLO`, start the frame loop, create the overlay.
- **Pick the remote video:** among `<video>` elements that are playing and have `videoWidth > 0`, ignore mirrored self-view (computed `transform` starting with `matrix(-1`), and choose the largest rendered area. Keep all selectors and heuristics in `apps/extension/src/content/meet-config.ts`. If no video is found for 5 s, show "Click the caller's video to select it" and let the user click a tile (store that choice for the session).
- **Frame loop:** use `video.requestVideoFrameCallback` and send at most `FRAME_FPS` frames per second. Draw the video into an `OffscreenCanvas` scaled to `FRAME_MAX_WIDTH` wide, `convertToBlob({ type: "image/jpeg", quality: 0.7 })`, convert to base64, send `FRAME` with `tsMs = nowMs()`. Send `VIDEO_LOST` when the video disappears. Skip a frame if the previous send is still in flight.
- **Overlay (shadow DOM, `overlay.inline.css`):** fixed top-right, `z-index` at the maximum, `pointer-events: none` except its buttons. Shows a traffic-light dot with a text label (do not rely on colour alone), a one-line reason, the challenge prompt with a countdown when in `CHALLENGE`, and a "Dismiss" button that sends `USER_DISMISS`. In `ALERT` it shows a larger banner. Never covers the call controls (bottom bar) or the center of the video tiles. Collapsible.
- On `MEET_STOP` or port disconnect: remove the overlay and stop the loop.

### 8.4 Gmail content script `apps/extension/src/content/gmail.ts`
- Watch for an opened email with a `MutationObserver`. Extract: subject, sender name and address, body text, and links (`text` and `href`). Gmail class names are obfuscated and change; keep the selectors in `gmail-config.ts` and expect to fix them. Starting points to **verify**: subject `h2.hP`, body `div.a3s`, sender `span.gD` (address in its `email` attribute).
- Build an `EmailInput`, call `createTextClassifier()` (init once with `assetBase = chrome.runtime.getURL("")`), and insert a banner above the message with `label`, `risk`, and `reasons`. Show nothing for `safe`, or a small unobtrusive "checked" mark.
- Only runs on emails the user opens. Never store or transmit email content. The text classifier must therefore be plain TypeScript with its weights **bundled by import** (JSON), no model downloads.

### 8.5 Popup `apps/extension/src/popup/index.tsx` (React)
Start / Stop button (sends `START` with the active tab id, only enabled on `meet.google.com`), current state, sensitivity selector, notification and sound toggles, a mock-switches section (collapsed, for debugging), and the fixed text: "Audio, video, and email text are analyzed on this device and never uploaded."

---

## 9. Pipeline and arbiter specification (Full-Stack Integration)

### 9.1 `@sentinel/pipeline`
```ts
export interface PipelineDeps {
  audio: AudioDetector; vision: VisionDetector; sync: SyncDetector;
  challenge: ChallengeVerifier; arbiter: Arbiter;
}
export interface PipelineUpdate {
  out: ArbiterOutput; audio: AudioResult | null; sync: SyncResult | null; frame: FrameResult | null;
}
export interface Pipeline {
  start(init: InitOptions): Promise<void>;
  pushAudio(chunk: Float32Array, tsMs: Ms): void;            // 100 ms mono 16 kHz
  pushFrame(frame: ImageBitmap, tsMs: Ms): Promise<void>;
  setSettings(s: Settings): void;
  onUpdate(cb: (u: PipelineUpdate) => void): void;
  stop(): void;
}
export function createPipeline(deps: PipelineDeps, opts?: { logger?: (line: object) => void }): Pipeline;
```
Behavior:
- `pushAudio`: compute RMS of the chunk, call `sync.pushAudioEnergy(rms, tsMs)`, then `await audio.push(...)`. If a result returns, call `arbiter.onAudio(result)`. Never run two `audio.push` calls at once (queue at most one pending chunk; drop older audio chunks if inference falls behind and count the drops).
- `pushFrame`: `frame = await vision.processFrame(...)`, then `sync.pushFrame(frame)`, `challenge.pushFrame(frame)`, `arbiter.onFrame(frame)`, `s = sync.getSync()` then `arbiter.onSync(s)`, `c = challenge.poll()` then `arbiter.onChallenge(c)`.
- After every input, call `arbiter.tick(nowMs)`. If `out.state === "CHALLENGE"` and the challenge has not been started, call `challenge.start(out.challenge, nowMs)`. If the state leaves `CHALLENGE`, call `challenge.cancel()`.
- Every update emits `PipelineUpdate` and, if a logger is set, one JSON line (`ts`, inputs, fused score, state, reasons, per-stage `latencyMs`, dropped counts).

### 9.2 `@sentinel/arbiter` defaults
```ts
export interface ArbiterConfig {
  wAudio: number; wSync: number;                 // 0.5, 0.5 to start; tune on clips
  minEvidence: number;                           // 0.2: if sum of (weight * confidence) is below this, there is no score
  emaTauMs: number;                              // 4000: time-based smoothing
  thresholds: Record<Sensitivity, { suspicious: number; challenge: number; alert: number }>;
  hysteresis: number;                            // 0.1: exit threshold = enter threshold - 0.1
  suspiciousDwellMs: number;                     // 3000
  challengeDwellMs: number;                      // 5000 above the challenge threshold (or 8000 in SUSPICIOUS)
  challengeTimeoutMs: number;                    // 12000
  alertDwellMs: number;                          // 3000 above the alert threshold
  dismissCooldownMs: number;                     // 60000
  artifactAlertThreshold: number;                // 0.6
}
// thresholds.medium = { suspicious: 0.50, challenge: 0.65, alert: 0.80 }
// thresholds.low    = medium + 0.10   (fewer alerts)
// thresholds.high   = medium - 0.10   (more alerts)
```
Fusion: `fused = sum(w_i * c_i * s_i) / sum(w_i * c_i)` over the signals that exist, then apply a time-based EMA: `alpha = 1 - exp(-dt / emaTauMs)`. If `sum(w_i * c_i) < minEvidence`, output `fusedScore: null` and keep `CLEAR` with the reason "Not enough data".

State machine:
| From | To | Condition |
|---|---|---|
| CLEAR | SUSPICIOUS | fused above `suspicious` for `suspiciousDwellMs` |
| SUSPICIOUS | CLEAR | fused below `suspicious - hysteresis` |
| SUSPICIOUS | CHALLENGE | fused above `challenge` for `challengeDwellMs`, or still SUSPICIOUS after 8 s |
| CHALLENGE | ALERT | verifier `failed`, or `artifactScore >= artifactAlertThreshold`, or timeout with fused above `suspicious`, or fused above `alert` for `alertDwellMs` |
| CHALLENGE | SUSPICIOUS or CLEAR | verifier `passed` and `artifactScore` low (go to the state matching fused) |
| ALERT | CLEAR | user dismiss (then `dismissCooldownMs` before a new alert) or fused below `suspicious - hysteresis` for 30 s |

Challenge choice: rotate through `turn_head_left_right`, `cover_half_face`, `raise_fingers` (skip `raise_fingers` if Vision Module reports no hand tracking), never repeat the last one. `ArbiterOutput.reasons` always explains the state in plain words (for example "Voice score high (0.78); lip-sync mismatch (0.71)"), because the demo must explain itself.

Required unit tests (`packages/arbiter/tests`): no data stays CLEAR; sustained high scores escalate in order; flicker around the threshold does not change state (hysteresis); a failed challenge goes to ALERT; a passed challenge de-escalates; dismiss cooldown works.

---

## 10. Model decision records, test data, evaluation

### 10.1 `MODEL_CARD.md` template (Utkarsh writes `docs/audio-module/MODEL_CARD.md` for audio and text, Yash writes `docs/vision-module/MODEL_CARD.md` for vision)
Every model-using package fills this in **before** handover. A code generator needs one concrete model, not a list, so decide in the first spike and write it down.
```
Model name and version:
Source URL and commit/checkpoint:
Licence (and whether we may redistribute it inside a public extension: yes/no/unclear):
Files in assets/ (name, size, sha256):
Input spec (names, shapes, dtype, sample rate or image size, normalization):
Output spec (names, shapes, meaning, which index or sign means "fake"):
Feature extraction (exact recipe and parameters, or "inside the graph"):
Backend used (webgpu/wasm), precision (fp32/int8/fp16):
Latency (median and p95, ms) on the demo laptop, per window or per frame:
Accuracy on our clips (counts, accuracy, EER or detection rate, false positive rate):
Recommended thresholds and why:
Known failure cases:
Alternatives tried and why rejected:
```

### 10.2 Audio `assets/meta.json` (Audio Module writes it; the audio package reads it, so the code is model-agnostic)
```json
{
  "id": "name-of-model",
  "sampleRate": 16000,
  "windowSamples": 64000,
  "hopSamples": 32000,
  "inputName": "input",
  "outputName": "output",
  "outputKind": "logits2",
  "fakeIndex": 0,
  "features": "raw",
  "normalize": "none",
  "silenceRmsThreshold": 0.005,
  "thresholdFake": 0.5,
  "license": "…",
  "source": "…"
}
```
`outputKind` is one of `logits2` (two logits, use softmax and `fakeIndex`), `logit1` (one logit, sigmoid, higher = fake), `sigmoid1` (one probability of fake), or `score1_bonafide` (higher = real, the package inverts it). If a model needs log-mel or LFCC features, Audio Module implements them in TypeScript and tests them against Python golden vectors (see the Audio Module doc).

### 10.3 Shared test data
- **Clips:** at least 10 real and 10 fake, 20-30 s each, mixed audio-only, video-only, and both. Stored in `eval/clips/` (not in git; share by zip or LFS).
- **Labels:** each role writes its own CSV (`eval/clips/labels/audio-eval.csv`, `role2.csv`) with columns `clip_id,file,speaker,label,tool,has_audio,has_video,notes`. `label` is `real` or `fake`. Full-Stack Integration's script concatenates them.
- **Fake generation:** Audio Module makes cloned-voice audio, Vision Module makes face-swapped video. Use only your own faces and voices, or people who have agreed. Never use a real third party.
- **Holdout:** keep at least 4 clips (2 real, 2 fake) that nobody tunes on, for the final numbers.
- Clips used by the browser self-test: one short real speech clip and one blank frame are provided by Full-Stack Integration; a face image for the vision self-test is provided by Vision Module (`packages/vision-detector/assets/selftest/face.jpg`, a team member who agreed).

### 10.4 Metrics to report
- Audio: accuracy and EER on our clips; behaviour on silence, music, and background noise.
- Sync: detection rate on fakes and false positive rate on real speech; behaviour when the caller is muted or listening.
- Challenges: pass rate on real people, fail or high `artifactScore` rate on fakes, per challenge type.
- End to end (Full-Stack Integration): accuracy, false alarms per 10 minutes of real calls, time to alert after a fake appears.
- Text: precision and false positive rate on a labelled set plus about 20 hand-made examples.
- Do not report numbers measured on the clips you tuned on.

---

## 11. Integration procedure, self-test, and check scripts

### 11.1 How the three folders become one project
1. **Everyone builds the same scaffold from Appendix A** (all shared files are written out there, tested). No starter repo has to be shared. The scaffold is never delivered by Utkarsh or Yash.
2. **Phase 1:** Utkarsh and Yash work only inside their own folders, against stub packages, and verify with `pnpm verify:parts` and the harness self-test. They hand over at three points (v0, v1, final) as `role<N>-<yyyymmdd>.tgz` sent to Aditya.
3. **Phase 2, to integrate a handover (Aditya):**
   - Delete the stub folders the tarball replaces and unpack the new ones in the same place (section 18.5).
   - Run `pnpm install` (installs each package's pinned dependencies).
   - Run `pnpm verify` (integration check, privacy check, typecheck, tests, extension build).
   - Run `pnpm harness`, open the printed address, press **Run self-test**, and read the results table. The summary line says which modules are real and which are still mocks.
   - Only then load `apps/extension/dist` unpacked and try a live call.
   - When the full stack works, write the root `README.md` and push to GitHub (section 18.8).
4. **Phase 3:** Utkarsh and Yash clone the repository and continue on branches with pull requests (section 18.8). Nobody patches another person's folder; if something fails, the check message names the package and its owner.

### 11.2 `packages/contracts/src/selftest.ts` (canonical source in Appendix A; it runs in the browser harness and in node for mocks)
```ts
export interface SelfTestDeps {
  audio: AudioDetector; vision: VisionDetector; sync: SyncDetector;
  challenge: ChallengeVerifier; text: TextClassifier;
}
export interface SelfTestEnv {
  assetBase: string;
  loadTestFace(): Promise<ImageBitmap>;    // real face photo (from the vision package assets)
  loadBlankFrame(): Promise<ImageBitmap>;  // black 320x180
}
export interface CheckResult { module: string; name: string; ok: boolean; detail: string; ms: number }
export async function runContractSelfTest(d: SelfTestDeps, env: SelfTestEnv): Promise<CheckResult[]>;
```
Checks (every check catches errors and reports `ok: false` with the message; a module that throws must not stop the others):

| Module | Checks |
|---|---|
| audio | `init` finishes within 30 s. Pushing 10 s of synthetic speech-like noise in 100 ms chunks returns at least one non-null result. Every result has finite `scoreFake` and `confidence` in [0,1], `windowEndMs > windowStartMs`, finite non-negative `latencyMs`. Pushing 5 s of silence gives results with `confidence <= 0.2`. `dispose()` twice does not throw. Reports median `latencyMs`. |
| vision | `init` finishes within 30 s. A blank frame gives `faceFound: false` and `mouthAperture: 0` without throwing. The test face gives `faceFound: true`, `mouthAperture` finite in [0, 1], finite head pose angles, `landmarkQuality` in [0,1]. Reports median `latencyMs` over 20 frames. |
| sync | Before enough data, `getSync()` is `null`. After 10 s of synthetic speech energy with a **matching** mouth aperture signal: `scoreFake < 0.4` and `confidence > 0.5`. With an **unrelated** aperture signal: `scoreFake > 0.6`. `reset()` returns it to `null`. |
| challenge | `poll()` is `null` before `start`. With a synthetic yaw sweep to ±35° within 5 s: `passed`. With a constant yaw for 12 s: `failed`. A synthetic frame sequence where landmarkQuality drops to 0.2 at large yaw: `artifactScore > 0.5`. `cancel()` makes `poll()` null. |
| text | A benign sample email: `label: "safe"`, `risk < 0.4`. A phishing sample (urgent credential request, mismatched link domain): `label` not `safe`, `risk > 0.6`, at least one `reasons` entry. Reports `latencyMs`. |

`packages/contracts/src/fixtures.ts` holds the synthetic generators (`syntheticSpeechChunks`, `silenceChunks`, `apertureFromEnergy`, `yawSweep`, `benignEmail`, `phishingEmail`) so every role and the harness use the same data.

### 11.3 `scripts/check-integration.mjs` (canonical source in Appendix A)
Fails (exit code 1) with a clear message if:
- any of the five role package folders is missing, or its `package.json` name is not `@sentinel/<folder>`;
- `src/index.ts` does not mention and export the required create function from section 2.2;
- a dependency version in a package contains `^`, `~`, or `latest` (except `workspace:*`);
- a role package folder contains **any README file** (the repository has one root README);
- a non-stub package has no `docs/audio-module/HANDOVER.md`, or no `docs/audio-module/MODEL_CARD.md` where a model is involved (audio, text, vision; Utkarsh is role 1, Yash is role 2);
- `sentinel.assets.json` is not valid JSON, or an asset's `from` does not exist (after `pnpm install`).
Warns (does not fail) if a package still depends on `@sentinel/mocks`, meaning it is still a stub.

### 11.4 `scripts/check-privacy.mjs` (canonical source in Appendix A)
Scans `packages/*/src` and `apps/*/src` (`.ts`, `.tsx`) and fails if it finds, outside comment lines: `fetch(` or `import(` followed by a string literal starting with `http://` or `https://`; `WebSocket`; `XMLHttpRequest`; `sendBeacon`; `EventSource`. An exception list `scripts/privacy-allow.json` exists and only Full-Stack Integration may edit it, with a written reason. This makes "nothing leaves your machine" a build-time check, not just a claim. Still verify in the browser Network tab.

---

## 12. Build order and milestones

No fixed schedule: each person generates their own part at their own pace, in the order given in their role doc (Part B). What matters is that the **milestones** below are reached in order, because later ones depend on earlier ones.

| Milestone | What must be true | Who |
|---|---|---|
| **M0: Spikes done** | Audio Module and Vision Module have chosen their models and written a draft `MODEL_CARD.md`; Full-Stack Integration has answered the capture and loading questions (Full-Stack Integration doc, B2) | All |
| **M1: Foundations frozen** | Scaffold (Appendix A) in place for everyone, contracts frozen, mock-driven extension runs end to end | Full-Stack Integration |
| **M2: First drop-in** | A first working version (v0, interface-correct even if the model is weak) of each role's packages is handed over to Aditya, dropped in, and the harness self-test is green | All |
| **M3: Full loop and on GitHub** | Real audio and vision feed the arbiter in the harness: score, state, challenge, alert; then the same on a live Meet call. Aditya writes the root README and pushes the project to GitHub; Utkarsh and Yash clone it | Aditya, with Utkarsh and Yash |
| **M4: Evidence** | Final versions merged (tarball before M3, pull requests after), holdout evaluation done, arbiter weights and thresholds tuned, benchmark numbers recorded | All |
| **M5: Freeze and release** | Demo script rehearsed, fallback recording saved, bug fixes only, release build and README done | All |

Until the project is on GitHub (M3), Utkarsh and Yash hand over to Aditya at three points: **v0** (interface-correct, even if weak), **v1** (working and measured), **final** (tuned, documented, holdout numbers), each as a tarball (section 2.1 rule 9). After M3, changes arrive as pull requests from role branches.

Short sync between the three people whenever something is blocked or a contract question comes up: what is blocked, which contract question is open, what was handed over.

---

## 13. Performance budgets, privacy, risks

### 13.1 Budgets (targets; adjust after measuring on the demo laptop)
| Stage | Budget |
|---|---|
| Audio model per window | under 300 ms |
| Vision per frame at 10 fps | under 60 ms (the pipeline drops frames when busy; lower `FRAME_FPS` if this budget is missed) |
| Sync + arbiter per update | under 20 ms |
| JPEG encode (content script) + decode (offscreen) | under 15 ms per frame |
| Time from a fake appearing to a state change | under about 10 s (smoothing included) |
| Call quality | no visible stutter; Meet stays responsive |

### 13.2 Privacy and honesty
- "Nothing leaves your machine" must be true: `pnpm check:privacy` plus a manual Network tab check on the demo.
- Minimum permissions only (section 7.3).
- Everything written in the README, resumes, and LinkedIn matches what was measured. Report false positives and failures.

### 13.3 Risks
| Risk | Mitigation | Owner |
|---|---|---|
| No usable pre-trained audio model | First spike; fallback to a small model trained on spectral features in Colab | Audio Module |
| Weak generalization to new voice cloners | Report honestly; rely on sync and challenges | Audio Module, Full-Stack Integration |
| ONNX Runtime bundling or WASM loading problems | First spike, asset copy rules, WASM single-thread default | Audio Module, Full-Stack Integration |
| Tab capture, offscreen, or autoplay quirks | First spike before anything else | Full-Stack Integration |
| JPEG frame transport too slow | Lower fps or width; measure early | Full-Stack Integration |
| Meet or Gmail DOM changes | Selectors in config files; manual video pick fallback | Full-Stack Integration |
| Lip-sync score too noisy | Longer window, lag search, return `null` when unsure | Vision Module |
| Good face-swaps pass the challenges | Stronger challenges (large yaw, hand occlusion); report honestly | Vision Module |
| Packages do not fit together | Fixed contracts, stubs, self-test, check scripts | Full-Stack Integration |
| Live fake setup fails on demo day | Recorded fallback is mandatory | All |

---

## 14. Demo

- **Primary:** Full-Stack Integration runs Meet and the extension on the demo laptop; a teammate joins from a second device as the fake caller (face swap from Vision Module, voice from Audio Module).
- **Fallback (mandatory, recorded before the freeze (M5)):** a pre-recorded fake session played as the caller.
- **Script (about 3 minutes):** real caller shows `CLEAR`; the fake caller turns `SUSPICIOUS`; a challenge appears; the fake breaks under it; `ALERT`; then a Gmail phishing example; then the latency numbers and the Network tab showing no uploads.
- Fakes only use your own faces and voices or people who agreed.

---

## 15. Deployment

There is no server to deploy. The extension is the product, so "deploying" means building the extension package and distributing it. **Owner: Full-Stack Integration**, with Roles 1 and 2 supplying model licence details and privacy-text inputs.

### 15.1 Distribution channels (they stack)

| Channel | When | Cost / review | Purpose |
|---|---|---|---|
| Load unpacked | As soon as the extension builds, and for the hackathon demo | Free, no review | Development, teammates, judges |
| GitHub Release (zip) | At release (M5) | Free, no review | Public download link and install steps in the README |
| Static project site | At release (M5) | Free tier (GitHub Pages, Vercel, Netlify, or Render static) | Landing page, demo video, install guide, privacy statement. Not a backend |
| Chrome Web Store | After the hackathon release | One-time developer fee (about $5, check current price); review can take days or longer | Real public deployment |
| Edge Add-ons | Optional, after Chrome | Free | Accepts Chrome extensions with little change |

### 15.2 Build and release steps

1. `npm run build` produces `apps/extension/dist` (manifest, service worker, offscreen page, content scripts, popup, bundled models).
2. Test the built output (not just the dev server): load unpacked from `dist` on a clean Chrome profile and run the demo script.
3. Bump the version in `manifest.json` and tag the repo (`v0.1.0`).
4. Zip `dist` and attach it to a GitHub Release with install steps: open `chrome://extensions`, enable Developer mode, choose "Load unpacked".
5. Optional: a GitHub Actions workflow that builds and attaches the zip when a tag is pushed.

### 15.3 Manifest V3 rules that affect us

- **No remotely hosted code.** Bundle the ONNX Runtime Web and MediaPipe WASM and JavaScript files inside the extension. Do not load them from a CDN. Model files (data) may be bundled or fetched, but bundling is the safest choice.
- Keep the default Manifest V3 CSP (it already allows WebAssembly). Do not add remote script sources. Verify WASM loads from the **built** output, not just the dev build.
- Check the Web Store's current package size limit. If models make the zip too large, host the model files on Hugging Face or the static site, download once on first run, cache in IndexedDB, and verify a checksum recorded in the package's `MODEL_CARD.md`. This downloads files to the user but never uploads call data.

### 15.4 Chrome Web Store checklist (submit after the hackathon release)

- [ ] Developer account registered and fee paid.
- [ ] Single-purpose description: "detects likely AI voice and face fakes during Google Meet calls".
- [ ] Privacy policy page hosted on the static site. It must say: audio, video, and email text are processed on the device and never uploaded or stored; what is kept locally (settings, decision logs) and how to clear it.
- [ ] A justification for each permission: `tabCapture` (read call audio), `offscreen` (run models), `activeTab`, host access to `meet.google.com` and `mail.google.com` only.
- [ ] Screenshots, a short promo image, icon set, and an accurate description. No claims beyond what was measured.
- [ ] Data-use disclosures in the dashboard filled in to match the privacy policy.
- [ ] Network tab check recorded: no audio, video, or email text leaves the machine.
- [ ] Support contact (email or GitHub issues link).
- [ ] Expect questions from reviewers about `tabCapture` and Gmail access, and answer with the privacy design.

### 15.5 Model hosting and licences

- Record every model's name, version, source URL, licence, and checksum in the package's `MODEL_CARD.md` (Roles 1 and 2).
- Confirm each licence allows redistribution inside a public extension before the GitHub Release. If one does not, document how users obtain it instead.

### 15.6 Optional server-side pieces (only if the team wants them)

None of these may receive call audio, video, or email text, or the privacy claim breaks.
- Model file hosting (Hugging Face or the static site).
- Opt-in anonymous alert counts with a small dashboard.
- Settings sync across devices.

### 15.7 Deployment order

1. Load-unpacked build works on a clean Chrome profile (at M3).
2. Licence check done for every bundled model (at M4).
3. Release zip, README install steps, static site with demo video and privacy statement (at M5).
4. GitHub Release published (at M5).
5. Chrome Web Store submission and review (after the hackathon release).

---

## 16. Open questions and definition of done

### 16.1 Open questions
1. Confirm Google Meet as the only platform.
2. Confirm the alert style (overlay plus optional notification and sound).
3. Which hackathon, deadline, format, and judging rubric?
4. Is a research paper still a goal, or are README plus demo video enough?
5. Names of the three role owners, and who tests whose handover.
6. Confirm the exact Node and Chrome versions everyone uses (Node 20.11+, Chrome 116+).

### 16.2 Definition of done
- `pnpm verify` passes on a fresh clone with all three folders in place.
- The harness self-test is all green for the five role modules.
- The extension loads unpacked and starts monitoring a Meet call from the popup.
- A real caller stays `CLEAR`; the fake caller reaches `ALERT` on the demo clips; at least one scripted challenge runs end to end.
- The Gmail check runs on a sample phishing email, or is explicitly cut.
- Latency and resource numbers are written down in `docs/benchmarks.md`.
- Network tab shows no outbound audio, video, or email text.
- Demo video, README with honest results, public GitHub repo, and a release zip exist.

---

## 17. Agent rules, final report, and handover checklist

Each role doc starts with a **START HERE** block containing the exact prompt to paste. This section holds the rules every agent follows. The prompts point here.

### 17.1 Rules for every agent (these are part of every prompt)
1. Work autonomously: run the commands, read the errors, fix them, and run again. Try up to three different fixes for one failure before reporting it as blocked.
2. Create the scaffold exactly as in Appendix A. **Never edit a scaffold file.** If a scaffold file seems wrong, stop and report it.
3. Write only inside your owned paths (section 2). Run `node scripts/check-ownership.mjs <role>` before finishing (Roles 1 and 2). It must pass.
4. Implement only the interfaces in `@sentinel/contracts`; use the exact export names in section 2.2.
5. No network calls from source code (section 2.1 rule 5). `pnpm check:privacy` must pass.
6. Install dependencies with exact versions: `pnpm add -E <package>@<version> --filter <workspace name>`. Never `^`, `~`, or `latest`. Record the versions in `docs/audio-module/HANDOVER.md`.
7. Do not guess library APIs or model details. Read the installed package's type definitions and README in `node_modules`, or the official documentation if you have web access. If you still cannot confirm something, say so in the final report and write the code so the uncertain part is isolated and easy to fix.
8. Do not use shell brace expansion (`{a,b}`) or tools that exist only on one operating system. Use plain commands or small Node scripts.
9. **Never create a README file** in role folders (Roles 1 and 2). Everything you generated is explained in `docs/audio-module/HANDOVER.md` and `docs/audio-module/MODEL_CARD.md` (template in 17.5). Full-Stack Integration writes the single root `README.md`.
10. Never claim more than was measured. Anything you could not measure goes into the final report as "not measured".
11. If `pnpm install` or `pnpm add` fails with `ERR_PNPM_IGNORED_BUILDS` for a dependency you added, do **not** edit `pnpm-workspace.yaml` (it is a scaffold file). Use `pnpm install --ignore-scripts` instead (tested: it exits cleanly and esbuild still works), and list the package in your final report under "Scaffold additions needed" so Full-Stack Integration can add `allowBuilds: <package>: false` to the workspace file.

### 17.2 When to stop and ask the human (only these cases)
- A scaffold file fails or conflicts and the fix is not obvious (do not edit it).
- A needed file or model cannot be downloaded (network blocked) **and** there is no documented fallback.
- Two documents contradict each other on something that changes a contract.
For everything else, use the documented fallback, record the assumption in `HANDOVER.md` and the final report, and keep going.

### 17.3 Final report (the agent ends with exactly this)
```
FINAL REPORT (Role N)
1. Files created: (list, grouped by package)
2. Commands run and results: (pnpm verify:parts / pnpm verify, tests passed, ownership check, privacy check)
3. Self-test: which modules are real vs placeholder/mock; results table if it could be run in a browser
4. Placeholders and assumptions: (each one, and the exact steps to replace it)
5. Not measured / not verified: (include anything that needs a real browser, real models, or real clips)
6. Human steps still needed: (numbered, exact)
7. Handover file: path of the tarball and the command used to make it
8. Scaffold additions needed: (dependency install-script decisions, or anything else Full-Stack Integration must add; "none" if none)
```

### 17.4 Handover checklist (before sending a tarball)
- [ ] Only owned folders are in the tarball (it includes your `docs/audio-module/` notes).
- [ ] `pnpm verify:parts` passes in your copy; `node scripts/check-ownership.mjs <role>` passes.
- [ ] The harness self-test results (table or screenshot) are included, or the report says why not.
- [ ] `docs/audio-module/HANDOVER.md` and `docs/audio-module/MODEL_CARD.md` are complete; versions are pinned; no README anywhere in your folders.
- [ ] `assets/` contains every file named in `sentinel.assets.json`.
- [ ] Known limitations and recommended thresholds are written down for Full-Stack Integration.

### 17.5 `docs/audio-module/HANDOVER.md` template (Utkarsh and Yash)
```
# Role <N> handover (<date>, version v0 / v1 / final)
1. What I built: (packages and what each does, in plain words)
2. Pinned versions: (every dependency and model, exact)
3. How to run my tests: (exact commands) and the latest result
4. Self-test result: (table, or why it could not be run)
5. Recommended settings: (thresholds, window sizes) and how they were chosen
6. Placeholders still in place: (each one, and the exact steps to replace it)
7. Known limits and failure cases: (honest)
8. Not measured / not verified:
9. Scaffold additions needed: (for example install-script decisions; "none" if none)
10. Notes for the root README: (what Aditya should say about my part, only what was measured)
```
`MODEL_CARD.md` uses the template in section 10.1.

---

## 18. Commands cheat sheet (copy and run)

### 18.1 Prerequisites (everyone)
- Node 20.11 or newer, Chrome 116 or newer, Git. (The scaffold was tested with Node 22 and pnpm 12.)
- pnpm: `corepack enable` then `corepack prepare pnpm@latest --activate` (or `npm i -g pnpm`).
- Python 3.10+ for Audio Module and Vision Module (Colab notebooks and eval scripts).
- Windows: use PowerShell or WSL; every command below works in either unless noted.

### 18.2 Full-Stack Integration: set up the project
Create the scaffold from Appendix A (the agent does this from the doc), then:
```bash
node scripts/make-stubs.mjs        # creates the five stub role packages
pnpm install
pnpm verify:parts                  # must pass before you generate anything
git init -b main && git add -A && git commit -m scaffold && git tag scaffold-baseline
```
Create the other Full-Stack Integration packages and apps (`packages/arbiter`, `packages/pipeline`, `apps/extension`) with the generation order in the Full-Stack Integration doc. For each new workspace package, give it a `package.json` with its `@sentinel/...` name and `workspace:*` dependencies (for example `"@sentinel/contracts": "workspace:*"`), then run `pnpm install` so the links are created.
Day-to-day:
```bash
pnpm test                          # all vitest tests (pure logic)
pnpm vitest run packages/arbiter   # tests of one package
pnpm typecheck                     # tsc --noEmit over the whole repo
pnpm build                         # builds apps/extension/dist
pnpm dev                           # same, in watch mode (reload the extension in chrome://extensions after changes)
pnpm harness                       # builds and serves the harness at http://localhost:5173
pnpm verify                        # integration check + privacy check + typecheck + tests + extension build
```
Load the extension: open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, select `apps/extension/dist`. After each rebuild press the reload icon on the extension card.
Debug views (all from `chrome://extensions`): the **service worker** link on the extension card; the popup by right-clicking its icon and choosing Inspect popup; the offscreen page from the card's **Inspect views** list (or `chrome://inspect/#other`); the content scripts in the Meet or Gmail tab's DevTools console (choose the extension's context in the console dropdown).

### 18.3 Audio Module and Vision Module: setup
The agent does this from Appendix A. By hand:
```bash
# 1. create the Appendix A files, then:
node scripts/make-stubs.mjs
pnpm install
pnpm verify:parts                  # passes with five "still a stub" warnings
git init -b main && git add -A && git commit -m scaffold && git tag scaffold-baseline
```
Then replace only **your** stub folders (Audio Module example) and add your pinned dependency:
```bash
rm -rf packages/audio-detector packages/text-classifier        # Windows PowerShell: Remove-Item -Recurse -Force packages/audio-detector, packages/text-classifier
# generate your real folders (agent or by hand; each needs a package.json named @sentinel/<folder> with workspace:* dependency on @sentinel/contracts), then:
pnpm install
pnpm add -E onnxruntime-web@<EXACT-VERSION-YOU-TESTED> --filter @sentinel/audio-detector     # -E = save exact version
pnpm vitest run packages/audio-detector
pnpm verify:parts
node scripts/check-ownership.mjs 1
pnpm harness                                         # open http://localhost:5173, press "Run self-test"
```
Vision Module equivalent: `pnpm add -E @mediapipe/tasks-vision@<EXACT-VERSION> --filter @sentinel/vision-detector`.
Python side (Audio Module and Vision Module, outside the build):
```bash
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\Activate.ps1
pip install numpy scipy onnx onnxruntime            # plus torch, librosa, soundfile as your notebooks need
```

### 18.4 Phase 1 handover: pack your folders (Utkarsh and Yash)
`tar` ships with macOS, Linux, and Windows 10+. Run from the repo root.
```bash
# Audio Module
tar -czf audio-module-$(date +%Y%m%d).tgz --exclude=node_modules \
  packages/audio-detector packages/text-classifier colab/audio colab/text eval/audio eval/text \
  eval/clips/labels/audio-eval.csv docs/role1
# Vision Module
tar -czf vision-module-$(date +%Y%m%d).tgz --exclude=node_modules \
  packages/vision-detector packages/sync-detector packages/challenge-verifier colab/vision eval/vision \
  eval/clips/labels/vision-eval.csv docs/role2
```
Windows PowerShell: replace `$(date +%Y%m%d)` with `$(Get-Date -Format yyyyMMdd)`. If `eval/clips` media files are large, send them separately (shared drive); do not pack them in the tarball.
Before packing, run `pnpm verify:parts` and `node scripts/check-ownership.mjs <role>`, and keep the harness self-test screenshot.

### 18.5 Phase 2: integrate a handover (Aditya)
```bash
# from the repo root, with the handover file next to it
rm -rf packages/audio-detector packages/text-classifier        # only the folders that this handover replaces (PowerShell: Remove-Item -Recurse -Force <paths>)
tar -xzf ../audio-module-20261018.tgz                                   # restores the owner's folders in place
pnpm install
pnpm verify
pnpm harness                                                     # open it, press "Run self-test", read the table
```
Then `pnpm build` and load `apps/extension/dist` unpacked for a live Meet check. If a step fails, send the owner the exact error text; they fix it in their folder and send a new tarball.

### 18.6 Model-file commands (examples; verify names and versions in the current documentation)
```bash
# Vision Module: bundled MediaPipe model files (check the MediaPipe documentation for the current URLs)
mkdir -p packages/vision-detector/assets
curl -L -o packages/vision-detector/assets/face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
curl -L -o packages/vision-detector/assets/hand_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
```
Audio Module export, verification, and quantization snippets are in the Audio Module doc, Part C.

### 18.7 Release build
```bash
pnpm verify
cd apps/extension/dist && tar -a -cf ../../../sentinel-extension-v0.1.0.zip . && cd ../../..    # zip of the built extension (bsdtar: macOS, Windows). Linux: cd dist && zip -r ../../../sentinel-extension-v0.1.0.zip .
git tag v0.1.0 && git push --tags
```

### 18.8 GitHub: push, clone, branch, pull request (Phase 2 and Phase 3)

**Aditya: first push** (after the full stack works and the root `README.md` is written). Create an **empty** repository on GitHub first (no README, no license, no .gitignore, because the project already has them).
```bash
git add -A && git commit -m "Integrate Audio and Vision modules, extension, README"
git branch -M main
git remote add origin https://github.com/<your-user>/<repo-name>.git
git push -u origin main
git push --tags
```
Then on GitHub: Settings, Collaborators, add Utkarsh and Yash. Optional: Settings, Branches, protect `main` and require a pull request, so nobody pushes to `main` directly.

**Utkarsh and Yash: clone and set up.**
```bash
git clone https://github.com/<your-user>/<repo-name>.git
cd <repo-name>
pnpm install
pnpm verify          # needs Node 20.11+ and pnpm; builds the whole extension
```

**Utkarsh and Yash: every change.** Work only inside your own folders (section 2).
```bash
git checkout main && git pull
git checkout -b audio-module/<topic>       # Yash: vision-module/<topic>
# ... make your changes inside your owned folders, update docs/audio-module/HANDOVER.md if behavior changed ...
pnpm verify:parts
node scripts/check-ownership.mjs 1  # Yash: 2. It compares against where your branch left main.
git add -A && git commit -m "audio-module: <what changed and why>"
git push -u origin audio-module/<topic>
# open a Pull Request into main on GitHub; Aditya reviews and merges
```
After a merge, everyone runs `git checkout main && git pull && pnpm install`.

**Rules:** never force-push `main`; keep `main` buildable (`pnpm verify` passes); one topic per branch; if a check fails, the message names the owner of the broken package.

**Large model files (optional Git LFS, not tested here).** If a model file is over about 50 MB, install Git LFS and, **before the first commit of that file**:
```bash
git lfs install
git lfs track "*.onnx" "*.task"
git add .gitattributes
```
Everyone who clones then needs Git LFS installed too.

**Lock file.** `pnpm-lock.yaml` is git-ignored so dependency installs cannot cause merge conflicts. Dependencies that matter are pinned to exact versions in each `package.json`. Aditya may decide later to commit a lock file; if he does, only he updates it.

---

## Appendix A: Scaffold files (canonical source, tested)

These are the shared files that make the three parts fit together. **Every agent creates all of them, exactly as written.** Full-Stack Integration (Aditya) keeps them as the base of the repository; Roles 1 and 2 (Utkarsh and Yash) make their own copy to work against and **never deliver it**. Do not edit any of them. If you think one is wrong, stop and report it instead of changing it.

How to materialize (this is also in each role doc's run book):
1. Create every file below at its path with exactly the content shown. Create parent folders as needed (do not use shell brace expansion; it does not work in every shell).
2. `node scripts/make-stubs.mjs` (creates the five stub role packages).
3. `pnpm install`
4. `pnpm verify:parts` must pass. Expected: five `WARN ... still a stub` lines, "Integration check passed", "Privacy check passed", 6 tests passed, harness built.
5. `git init -b main && git add -A && git commit -m scaffold && git tag scaffold-baseline` (Roles 1 and 2 need the tag for the ownership check until the project is on GitHub).

Tested in a sandbox with Node 22 and pnpm 12: steps 1-4 pass, and the pack/unpack handover commands and the clone-and-branch ownership check work against a local remote. The harness page itself could not be opened in a browser in that sandbox, so its first run in Chrome is part of your own verification.

There is **one README in the whole repository** (`README.md` at the root, written by Full-Stack Integration). Role packages have none.

### A.1 `package.json`
```json
{
  "name": "sentinel",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs",
    "dev": "node scripts/build.mjs --watch",
    "build:harness": "node scripts/build.mjs --harness",
    "harness": "node scripts/build.mjs --harness && node scripts/serve.mjs apps/harness/dist 5173",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "check:integration": "node scripts/check-integration.mjs",
    "check:privacy": "node scripts/check-privacy.mjs",
    "check:ownership": "node scripts/check-ownership.mjs",
    "verify": "pnpm check:integration && pnpm check:privacy && pnpm typecheck && pnpm test && pnpm build",
    "verify:parts": "pnpm check:integration && pnpm check:privacy && pnpm typecheck && pnpm test && pnpm build:harness"
  },
  "devDependencies": {
    "@types/chrome": "0.3.5",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "esbuild": "0.28.2",
    "react": "19.3.1",
    "react-dom": "19.3.1",
    "typescript": "7.0.2",
    "vitest": "5.0.5"
  }
}
```

### A.2 `pnpm-workspace.yaml`
```yaml
packages:
  - "packages/*"
  - "apps/*"
# Dependency install scripts: esbuild must run its script; protobufjs (pulled in by onnxruntime-web) does not need to.
# pnpm 10 reads onlyBuiltDependencies; pnpm 11+ reads allowBuilds (true = allow, false = explicitly skip).
onlyBuiltDependencies:
  - esbuild
allowBuilds:
  esbuild: true
  protobufjs: false
```

### A.3 `tsconfig.base.json`
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "strict": true, "skipLibCheck": true, "noEmit": true, "isolatedModules": true,
    "resolveJsonModule": true, "esModuleInterop": true, "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["chrome"]
  }
}
```

### A.4 `tsconfig.json`
```json
{
  "extends": "./tsconfig.base.json",
  "include": ["packages/*/src/**/*", "packages/*/tests/**/*", "apps/*/src/**/*"]
}
```

### A.5 `vitest.config.ts`
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["packages/*/tests/**/*.test.ts"], environment: "node" } });
```

### A.6 `.gitignore`
```
node_modules/
dist/
*.zip
*.tgz
*.log
pnpm-lock.yaml
colab/**/*.ckpt
colab/**/*.pt
eval/clips/**/*.mp4
eval/clips/**/*.wav
```

### A.7 `README.md`
```md
# Sentinel

Chrome extension that warns about deepfake voices and faces on Google Meet calls and flags phishing emails in Gmail. Everything runs in the browser.

This file is the **only README in the repository**. It is written and maintained by Full-Stack Integration (Aditya). Notes from Audio Module (Utkarsh) and Vision Module (Yash) live in `docs/audio-module/` and `docs/vision-module/`. The design is in `docs/00-master-integration-doc.md`.
```

### A.8 `scripts/build.mjs`
```js
import { build, context } from "esbuild";
import { cp, mkdir, rm, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = new Set(process.argv.slice(2));
const watch = args.has("--watch");
const target = args.has("--harness") ? "harness" : "extension";
const outDir = path.join(root, target === "extension" ? "apps/extension/dist" : "apps/harness/dist");

const inlineCss = {
  name: "inline-css",
  setup(b) {
    b.onLoad({ filter: /\.inline\.css$/ }, async (a) => ({
      contents: "export default " + JSON.stringify(await readFile(a.path, "utf8")),
      loader: "js",
    }));
  },
};

const entries = target === "extension"
  ? [
      { in: "apps/extension/src/background/index.ts", out: "background", format: "esm" },
      { in: "apps/extension/src/content/meet.ts", out: "content-meet", format: "iife" },
      { in: "apps/extension/src/content/gmail.ts", out: "content-gmail", format: "iife" },
      { in: "apps/extension/src/offscreen/index.ts", out: "offscreen", format: "esm" },
      { in: "apps/extension/src/offscreen/audio-worklet.ts", out: "audio-worklet", format: "iife" },
      { in: "apps/extension/src/popup/index.tsx", out: "popup", format: "esm" },
    ]
  : [{ in: "apps/harness/src/index.ts", out: "harness", format: "esm" }];

const common = {
  bundle: true, platform: "browser", target: "chrome116", sourcemap: true,
  minify: !watch, jsx: "automatic", logLevel: "info", plugins: [inlineCss],
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
};

async function findModuleDir(from, name) {
  let dir = from;
  while (true) {
    const p = path.join(dir, "node_modules", name);
    if (existsSync(p)) return p;
    const up = path.dirname(dir);
    if (up === dir) throw new Error(`Cannot find node module ${name} from ${from}`);
    dir = up;
  }
}

async function copyAssets() {
  const pkgsDir = path.join(root, "packages");
  for (const p of await readdir(pkgsDir)) {
    const pkgDir = path.join(pkgsDir, p);
    const f = path.join(pkgDir, "sentinel.assets.json");
    if (!existsSync(f)) continue;
    const { assets } = JSON.parse(await readFile(f, "utf8"));
    for (const a of assets) {
      let src;
      if (a.from.startsWith("node_modules:")) {
        const spec = a.from.slice("node_modules:".length);
        const parts = spec.split("/");
        const nameParts = spec.startsWith("@") ? 2 : 1;
        const name = parts.slice(0, nameParts).join("/");
        src = path.join(await findModuleDir(pkgDir, name), ...parts.slice(nameParts));
      } else src = path.join(pkgDir, a.from);
      if (!existsSync(src)) throw new Error(`[${p}] missing asset "${a.from}" (did you copy the model files into assets/?)`);
      const re = a.match ? new RegExp(a.match) : null;
      await cp(src, path.join(outDir, a.to), {
        recursive: true,
        filter: async (s) => !re || (await stat(s)).isDirectory() || re.test(path.basename(s)),
      });
    }
  }
}

async function run() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const pub = path.join(root, target === "extension" ? "apps/extension/public" : "apps/harness/public");
  if (existsSync(pub)) await cp(pub, outDir, { recursive: true });
  await copyAssets();
  for (const e of entries) {
    const opts = { ...common, entryPoints: { [e.out]: path.join(root, e.in) }, outdir: outDir, format: e.format };
    if (watch) await (await context(opts)).watch(); else await build(opts);
  }
  await writeFile(path.join(outDir, "build-info.json"), JSON.stringify({ builtAt: new Date().toISOString(), target }, null, 2));
  console.log(`Built ${target} -> ${outDir}`);
}
run().catch((e) => { console.error(e); process.exit(1); });
```

### A.9 `scripts/serve.mjs`
```js
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? ".");
const port = Number(process.argv[3] ?? 5173);
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".onnx": "application/octet-stream",
  ".task": "application/octet-stream", ".jpg": "image/jpeg", ".png": "image/png", ".map": "application/json",
};
createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(dir, p);
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    await stat(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end("Not found"); }
}).listen(port, () => console.log(`Serving ${dir} at http://localhost:${port}`));
```

### A.10 `scripts/check-integration.mjs`
```js
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
// folder -> required export, delivering role (1 = Utkarsh, 2 = Yash), and whether a model card is required
const REQUIRED = {
  "audio-detector":     { fn: "createAudioDetector",     role: 1, card: true },
  "text-classifier":    { fn: "createTextClassifier",    role: 1, card: true },
  "vision-detector":    { fn: "createVisionDetector",    role: 2, card: true },
  "sync-detector":      { fn: "createSyncDetector",      role: 2, card: false },
  "challenge-verifier": { fn: "createChallengeVerifier", role: 2, card: false },
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

for (const [dir, { fn, role, card }] of Object.entries(REQUIRED)) {
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
  for (const r of await readmes(base)) fail(`${dir}: remove ${path.relative(root, r)} (the repo has a single root README; put notes in docs/role${role}/HANDOVER.md)`);
  if (!isStub) {
    const notes = path.join(root, "docs", `role${role}`);
    if (!existsSync(path.join(notes, "HANDOVER.md"))) fail(`${dir}: docs/role${role}/HANDOVER.md missing`);
    if (card && !existsSync(path.join(notes, "MODEL_CARD.md"))) fail(`${dir}: docs/role${role}/MODEL_CARD.md missing`);
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
```

### A.11 `scripts/check-privacy.mjs`
```js
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
if (failures) { console.error(`\n${failures} privacy problem(s). Remove the call, or Full-Stack Integration adds a justified entry to scripts/privacy-allow.json.`); process.exit(1); }
console.log("Privacy check passed: no outbound network calls found in source.");
```

### A.12 `scripts/check-ownership.mjs`
```js
// Usage: node scripts/check-ownership.mjs <1|2>
// Fails if any file you changed or created is outside the paths owned by your role, or if you created a README.
// Baseline: the point where your branch left origin/main (after the project is on GitHub), otherwise the local tag scaffold-baseline.
import { execSync } from "node:child_process";

const role = process.argv[2];
const OWN = {
  "1": ["packages/audio-detector/", "packages/text-classifier/", "colab/audio/", "colab/text/", "eval/audio/", "eval/text/", "eval/clips/labels/audio-eval.csv", "docs/audio-module/"],
  "2": ["packages/vision-detector/", "packages/sync-detector/", "packages/challenge-verifier/", "colab/vision/", "eval/vision/", "eval/clips/labels/vision-eval.csv", "docs/vision-module/"],
};
if (!OWN[role]) { console.error("Usage: node scripts/check-ownership.mjs <1|2>   (Full-Stack Integration owns everything else and is not checked)"); process.exit(2); }

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
```

### A.13 `scripts/make-stubs.mjs`
```js
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
```

### A.14 `packages/contracts/package.json`
```json
{
  "name": "@sentinel/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

### A.15 `packages/contracts/sentinel.assets.json`
```json
{ "assets": [] }
```

### A.16 `packages/contracts/src/types.ts`
```ts
/** All timestamps: milliseconds on one shared clock = performance.timeOrigin + performance.now(). */
export type Ms = number;
/** 0 = looks real, 1 = looks fake. */
export type Score01 = number;

export const SAMPLE_RATE = 16000;          // analysis audio, mono
export const AUDIO_CHUNK_MS = 100;         // pipeline pushes 100 ms chunks (1600 samples)
export const FRAME_FPS = 10;               // video frames per second sent to the pipeline (the pipeline drops frames when busy)
export const FRAME_MAX_WIDTH = 480;        // px, aspect ratio kept

/** URL prefix that ends with "/", e.g. chrome.runtime.getURL("") in the extension, "/" in the harness. */
export interface InitOptions {
  assetBase: string;
  preferWebGPU?: boolean;   // detectors fall back to WASM/CPU if unavailable
}

/** Where assets are placed in dist (see sentinel.assets.json in each package). */
export const ASSET_PATHS = {
  audioModelDir: "models/audio/",   // model.onnx + meta.json (Audio Module)
  visionModelDir: "models/vision/", // face_landmarker.task (+ optional hand_landmarker.task) (Vision Module)
  ortDir: "ort/",                   // onnxruntime-web .wasm/.mjs files (Audio Module)
  mediapipeWasmDir: "mediapipe/wasm/", // @mediapipe/tasks-vision wasm files (Vision Module)
} as const;

// ---------- Audio Module: audio ----------
export interface AudioResult {
  windowStartMs: Ms;
  windowEndMs: Ms;
  scoreFake: Score01;
  confidence: Score01;    // 0 for silent or unusable windows
  latencyMs: number;      // inference time for this window
}
export interface AudioDetector {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  init(opts: InitOptions): Promise<void>;
  /** chunk: mono Float32 PCM at 16 kHz, values in [-1, 1]. tsMs = time of the FIRST sample. Returns a result when a hop completes, else null. */
  push(chunk: Float32Array, tsMs: Ms): Promise<AudioResult | null>;
  dispose(): void;        // safe to call twice
}

// ---------- Audio Module: text ----------
export interface EmailInput {
  subject: string;
  bodyText: string;
  links: { text: string; href: string }[];
  senderName: string;
  senderAddress: string;
  replyTo?: string;
}
export interface TextResult {
  risk: Score01;
  label: "safe" | "suspicious" | "phishing";
  reasons: string[];       // short plain-language strings shown in the banner
  latencyMs: number;
}
export interface TextClassifier {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  init(opts: InitOptions): Promise<void>;
  classify(e: EmailInput): Promise<TextResult>;
}

// ---------- Vision Module: vision ----------
export interface FrameResult {
  tsMs: Ms;
  faceFound: boolean;
  mouthAperture: number;   // inner-lip gap / face height, about 0..0.5; 0 if no face
  headPose: { yawDeg: number; pitchDeg: number; rollDeg: number };
  faceOccluded: boolean;   // face or mouth mostly hidden
  landmarkQuality: Score01;// 1 = stable, confident landmarks
  handNearFace: boolean;   // false if hands are not tracked
  latencyMs: number;
}
export interface VisionDetector {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  init(opts: InitOptions): Promise<void>;
  processFrame(frame: ImageBitmap, tsMs: Ms): Promise<FrameResult>;
  dispose(): void;
}

export interface SyncResult {
  tsMs: Ms;
  scoreFake: Score01;
  confidence: Score01;
  correlation: number;     // best Pearson r over the lag search
  windowMs: number;
}
export interface SyncDetector {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  pushAudioEnergy(rms: number, tsMs: Ms): void;   // one call per 100 ms chunk, from the pipeline
  pushFrame(r: FrameResult): void;
  getSync(): SyncResult | null;                    // null until enough speech has been seen
  reset(): void;
}

export type ChallengeType = "turn_head_left_right" | "cover_half_face" | "raise_fingers";
export interface ChallengeStatus {
  challenge: ChallengeType;
  state: "pending" | "passed" | "failed";
  artifactScore: Score01;  // 0 = face stayed clean, 1 = obvious breakdown
  evidence: string;        // short human-readable string for the overlay
}
export interface ChallengeVerifier {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  init(opts: InitOptions): Promise<void>;
  start(c: ChallengeType, tsMs: Ms): void;
  pushFrame(r: FrameResult): void;
  poll(): ChallengeStatus | null;                  // null if no challenge is active
  cancel(): void;
}

// ---------- Full-Stack Integration: arbiter ----------
export type ArbiterState = "CLEAR" | "SUSPICIOUS" | "CHALLENGE" | "ALERT";
export interface ArbiterOutput {
  tsMs: Ms;
  state: ArbiterState;
  fusedScore: Score01 | null;     // null when there is not enough data
  reasons: string[];
  challenge?: ChallengeType;      // set while state is CHALLENGE
  challengeDeadlineMs?: Ms;
}

// ---------- Settings ----------
export type Sensitivity = "low" | "medium" | "high";
export interface Settings {
  sensitivity: Sensitivity;
  notifications: boolean;
  sound: boolean;
  /** true = use the mock instead of the real module, per module (for debugging and fallbacks) */
  useMock: { audio: boolean; vision: boolean; sync: boolean; challenge: boolean };
}
export const DEFAULT_SETTINGS: Settings = {
  sensitivity: "medium",
  notifications: false,
  sound: false,
  useMock: { audio: false, vision: false, sync: false, challenge: false },
};
```

### A.17 `packages/contracts/src/messages.ts`
```ts
import type { ArbiterOutput, AudioResult, ChallengeType, FrameResult, Ms, Settings, SyncResult } from "./types";

export const PORT_MEET = "sentinel-meet";

/** popup -> service worker (chrome.runtime.sendMessage). Always include v: 1. */
export type PopupToSw =
  | { v: 1; t: "START"; tabId: number }
  | { v: 1; t: "STOP" }
  | { v: 1; t: "GET_STATE" }
  | { v: 1; t: "SET_SETTINGS"; settings: Settings };
export interface SwState { running: boolean; tabId: number | null; settings: Settings; error?: string }

/** service worker -> offscreen document (chrome.runtime.sendMessage, target must be "offscreen"). */
export type SwToOffscreen =
  | { v: 1; target: "offscreen"; t: "OFFSCREEN_START"; streamId: string; settings: Settings }
  | { v: 1; target: "offscreen"; t: "OFFSCREEN_STOP" }
  | { v: 1; target: "offscreen"; t: "SETTINGS"; settings: Settings };

/** service worker -> Meet content script (chrome.tabs.sendMessage). */
export type SwToContent =
  | { v: 1; t: "MEET_START"; settings: Settings }
  | { v: 1; t: "MEET_STOP" };

/** Meet content script -> offscreen, over the port named PORT_MEET. */
export type ContentToOffscreen =
  | { v: 1; t: "HELLO" }
  | { v: 1; t: "FRAME"; jpegB64: string; w: number; h: number; tsMs: Ms }
  | { v: 1; t: "VIDEO_LOST" }
  | { v: 1; t: "USER_DISMISS" };

/** offscreen -> Meet content script, over the same port. */
export type OffscreenToContent =
  | { v: 1; t: "UPDATE"; out: ArbiterOutput; audio: AudioResult | null; sync: SyncResult | null; frame: FrameResult | null }
  | { v: 1; t: "CHALLENGE"; challenge: ChallengeType; prompt: string; deadlineMs: Ms }
  | { v: 1; t: "STATUS"; running: boolean; note?: string };

export const CHALLENGE_PROMPTS: Record<ChallengeType, string> = {
  turn_head_left_right: "Ask the caller to slowly turn their head left, then right.",
  cover_half_face: "Ask the caller to cover half of their face with their hand.",
  raise_fingers: "Ask the caller to hold up three fingers next to their face.",
};
```

### A.18 `packages/contracts/src/util.ts`
```ts
import type { Ms, Score01 } from "./types";

/** The shared clock used by every context: performance.timeOrigin + performance.now(). */
export const nowMs = (): Ms => performance.timeOrigin + performance.now();

/** Root-mean-square of a chunk. Returns 0 for an empty chunk. */
export function rms(chunk: Float32Array): number {
  let s = 0;
  for (let i = 0; i < chunk.length; i++) s += chunk[i] * chunk[i];
  return Math.sqrt(s / Math.max(1, chunk.length));
}

export const clamp01 = (x: number): Score01 => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
```

### A.19 `packages/contracts/src/fixtures.ts`
```ts
import type { EmailInput, FrameResult, Ms } from "./types";
import { AUDIO_CHUNK_MS, SAMPLE_RATE } from "./types";
import { rms } from "./util";

export const CHUNK_SAMPLES = (SAMPLE_RATE * AUDIO_CHUNK_MS) / 1000; // 1600

/** Deterministic pseudo-random numbers in [0, 1) (mulberry32). */
export function rng(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Loudness envelope of the synthetic "speech", always between 0 and 1. */
export function speechEnvelope(tSec: number): number {
  return 0.5 + 0.3 * Math.sin(2 * Math.PI * 2.3 * tSec) + 0.2 * Math.sin(2 * Math.PI * 0.7 * tSec + 0.5);
}

/** Speech-like test audio: low-passed noise with a varying loudness envelope. 100 ms chunks, 16 kHz mono. */
export function syntheticSpeechChunks(seconds: number, seed = 1): Float32Array[] {
  const r = rng(seed);
  const n = Math.round((seconds * 1000) / AUDIO_CHUNK_MS);
  const chunks: Float32Array[] = [];
  let lp = 0;
  let sample = 0;
  for (let c = 0; c < n; c++) {
    const ch = new Float32Array(CHUNK_SAMPLES);
    for (let i = 0; i < CHUNK_SAMPLES; i++, sample++) {
      lp = 0.8 * lp + 0.2 * (r() * 2 - 1);
      ch[i] = speechEnvelope(sample / SAMPLE_RATE) * lp * 1.5;
    }
    chunks.push(ch);
  }
  return chunks;
}

export function silenceChunks(seconds: number): Float32Array[] {
  const n = Math.round((seconds * 1000) / AUDIO_CHUNK_MS);
  return Array.from({ length: n }, () => new Float32Array(CHUNK_SAMPLES));
}

/** One RMS value per 100 ms chunk (what the pipeline gives SyncDetector.pushAudioEnergy). */
export const energySeries = (chunks: Float32Array[]): number[] => chunks.map(rms);

/** Mouth aperture (one value per 100 ms) that follows the loudness envelope of syntheticSpeechChunks. */
export function matchingAperture(seconds: number, seed = 3): number[] {
  const r = rng(seed);
  const n = Math.round((seconds * 1000) / AUDIO_CHUNK_MS);
  return Array.from({ length: n }, (_, i) => 0.03 + 0.25 * speechEnvelope((i * AUDIO_CHUNK_MS) / 1000 + 0.05) + 0.01 * (r() - 0.5));
}

/** Mouth aperture that has nothing to do with the audio (smooth random walk). */
export function unrelatedAperture(seconds: number, seed = 11): number[] {
  const r = rng(seed);
  const n = Math.round((seconds * 1000) / AUDIO_CHUNK_MS);
  let a = 0.15;
  return Array.from({ length: n }, () => {
    a = Math.min(0.3, Math.max(0.02, 0.92 * a + 0.08 * (0.02 + 0.28 * r())));
    return a;
  });
}

export function makeFrame(tsMs: Ms, o: Partial<FrameResult> = {}): FrameResult {
  return {
    tsMs, faceFound: true, mouthAperture: 0.1,
    headPose: { yawDeg: 0, pitchDeg: 0, rollDeg: 0 },
    faceOccluded: false, landmarkQuality: 0.9, handNearFace: false, latencyMs: 5, ...o,
  };
}

/** Frames (default 10 per second) where yaw sweeps 0 -> +max -> 0 -> -max -> 0 over `seconds`. */
export function yawSweepFrames(startMs: Ms, seconds = 5, fps = 10, maxYaw = 35, collapseAtLargeYaw = false): FrameResult[] {
  const n = Math.round(seconds * fps);
  return Array.from({ length: n }, (_, i) => {
    const t = i / fps;
    const yaw = maxYaw * Math.sin((2 * Math.PI * t) / seconds);
    const big = Math.abs(yaw) >= 20;
    return makeFrame(startMs + i * (1000 / fps), {
      headPose: { yawDeg: yaw, pitchDeg: 0, rollDeg: 0 },
      landmarkQuality: collapseAtLargeYaw && big ? 0.2 : 0.9,
    });
  });
}

/** Frames with a constant head pose (the caller ignores the challenge). */
export function constantYawFrames(startMs: Ms, seconds = 13, fps = 10, yawDeg = 0): FrameResult[] {
  const n = Math.round(seconds * fps);
  return Array.from({ length: n }, (_, i) =>
    makeFrame(startMs + i * (1000 / fps), { headPose: { yawDeg, pitchDeg: 0, rollDeg: 0 } }));
}

export const benignEmail: EmailInput = {
  subject: "Team lunch on Friday",
  bodyText: "Hi all, we are going to the new place near the office on Friday at 1 pm. Let me know if you have any dietary needs. Thanks, Priya",
  links: [],
  senderName: "Priya Sharma",
  senderAddress: "priya.sharma@examplecorp.com",
};

export const phishingEmail: EmailInput = {
  subject: "URGENT: Your account will be closed within 24 hours",
  bodyText: "Dear customer, we detected unusual activity. You must verify your password and card details immediately or your account will be closed. Click the link below to confirm your login.",
  links: [{ text: "https://www.paypal.com/verify", href: "http://paypa1-secure-login.xyz/verify" }],
  senderName: "PayPal Support",
  senderAddress: "support@paypa1-secure-login.xyz",
  replyTo: "helpdesk@mail-gmx.example",
};
```

### A.20 `packages/contracts/src/selftest.ts`
```ts
import type {
  AudioDetector, ChallengeVerifier, EmailInput, SyncDetector, TextClassifier, VisionDetector,
} from "./types";
import { AUDIO_CHUNK_MS } from "./types";
import {
  benignEmail, constantYawFrames, energySeries, makeFrame, matchingAperture, phishingEmail,
  silenceChunks, syntheticSpeechChunks, unrelatedAperture, yawSweepFrames,
} from "./fixtures";
import { nowMs } from "./util";

export interface SelfTestDeps {
  audio: AudioDetector;
  vision: VisionDetector;
  sync: SyncDetector;
  challenge: ChallengeVerifier;
  text: TextClassifier;
}
export interface SelfTestEnv {
  assetBase: string;
  /** A real face photo (from the vision package assets). Mocks ignore it. */
  loadTestFace(): Promise<ImageBitmap>;
  /** A black frame, for example 320x180. */
  loadBlankFrame(): Promise<ImageBitmap>;
}
export interface CheckResult { module: string; name: string; ok: boolean; detail: string; ms: number }

const in01 = (x: unknown): boolean => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
const median = (a: number[]): number => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} took longer than ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
async function check(out: CheckResult[], module: string, name: string, fn: () => Promise<string | void>) {
  const t0 = performance.now();
  try {
    const detail = (await fn()) ?? "ok";
    out.push({ module, name, ok: true, detail, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    out.push({ module, name, ok: false, detail: String((e as Error)?.message ?? e), ms: Math.round(performance.now() - t0) });
  }
}

/** Runs every module through the same checks. A module that throws never stops the others. */
export async function runContractSelfTest(d: SelfTestDeps, env: SelfTestEnv): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const init = { assetBase: env.assetBase };

  // ---------------- audio ----------------
  await check(out, "audio", "init within 30 s", async () => { await withTimeout(d.audio.init(init), 30000, "audio.init"); });
  await check(out, "audio", "scores in range on 12 s of synthetic speech", async () => {
    const chunks = syntheticSpeechChunks(12);
    const t0 = nowMs();
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      const r = await d.audio.push(chunks[i], t0 + i * AUDIO_CHUNK_MS);
      if (r) results.push(r);
    }
    assert(results.length >= 1, "no result after 12 s of audio (window longer than 12 s, or push never returns a result)");
    for (const r of results) {
      assert(in01(r.scoreFake), `scoreFake out of range: ${r.scoreFake}`);
      assert(in01(r.confidence), `confidence out of range: ${r.confidence}`);
      assert(r.windowEndMs > r.windowStartMs, "windowEndMs must be greater than windowStartMs");
      assert(Number.isFinite(r.latencyMs) && r.latencyMs >= 0, `bad latencyMs: ${r.latencyMs}`);
    }
    return `${results.length} results, median latency ${median(results.map((r) => r.latencyMs)).toFixed(1)} ms`;
  });
  await check(out, "audio", "silence gives confidence <= 0.2", async () => {
    const chunks = silenceChunks(20);
    const t0 = nowMs() + 20000;
    let last = null;
    for (let i = 0; i < chunks.length; i++) {
      const r = await d.audio.push(chunks[i], t0 + i * AUDIO_CHUNK_MS);
      if (r) last = r;
    }
    assert(last, "no result after 20 s of silence");
    assert(last.confidence <= 0.2, `confidence on silence is ${last.confidence}, expected <= 0.2`);
  });
  await check(out, "audio", "dispose() twice does not throw", async () => { d.audio.dispose(); d.audio.dispose(); });

  // ---------------- vision ----------------
  await check(out, "vision", "init within 30 s", async () => { await withTimeout(d.vision.init(init), 30000, "vision.init"); });
  await check(out, "vision", "blank frame: no face, aperture 0", async () => {
    if (d.vision.isMock) return "skipped (mock)";
    const r = await d.vision.processFrame(await env.loadBlankFrame(), nowMs());
    assert(r.faceFound === false, "faceFound must be false on a blank frame");
    assert(r.mouthAperture === 0, "mouthAperture must be 0 when no face is found");
  });
  await check(out, "vision", "test face: face found, values in range", async () => {
    const face = await env.loadTestFace();
    const lat: number[] = [];
    let r = await d.vision.processFrame(face, nowMs());
    for (let i = 0; i < 20; i++) {
      r = await d.vision.processFrame(face, nowMs() + (i + 1) * 100);
      lat.push(r.latencyMs);
    }
    assert(r.faceFound, "no face found in the test image (is assets/selftest/face.jpg present and clear?)");
    assert(Number.isFinite(r.mouthAperture) && r.mouthAperture >= 0 && r.mouthAperture <= 1, `mouthAperture out of range: ${r.mouthAperture}`);
    const hp = r.headPose;
    assert([hp.yawDeg, hp.pitchDeg, hp.rollDeg].every(Number.isFinite), "head pose angles must be finite");
    assert(in01(r.landmarkQuality), `landmarkQuality out of range: ${r.landmarkQuality}`);
    return `median latency ${median(lat).toFixed(1)} ms`;
  });
  await check(out, "vision", "dispose() twice does not throw", async () => { d.vision.dispose(); d.vision.dispose(); });

  // ---------------- sync ----------------
  await check(out, "sync", "returns null before enough data", async () => {
    d.sync.reset();
    const t0 = nowMs();
    const e = energySeries(syntheticSpeechChunks(1));
    const a = matchingAperture(1);
    for (let i = 0; i < e.length; i++) { d.sync.pushAudioEnergy(e[i], t0 + i * 100); d.sync.pushFrame(makeFrame(t0 + i * 100, { mouthAperture: a[i] })); }
    assert(d.sync.getSync() === null, "getSync() must be null after only 1 s of data");
  });
  const feed = (aperture: number[]) => {
    d.sync.reset();
    const e = energySeries(syntheticSpeechChunks(10));
    const t0 = nowMs();
    for (let i = 0; i < e.length; i++) { d.sync.pushAudioEnergy(e[i], t0 + i * 100); d.sync.pushFrame(makeFrame(t0 + i * 100, { mouthAperture: aperture[i] })); }
    return d.sync.getSync();
  };
  await check(out, "sync", "matching lips: low scoreFake, confidence > 0.5", async () => {
    if (d.sync.isMock) return "skipped (mock)";
    const r = feed(matchingAperture(10));
    assert(r, "getSync() returned null after 10 s of speech");
    assert(r.scoreFake < 0.4, `scoreFake ${r.scoreFake.toFixed(2)} should be < 0.4 for matching lips`);
    assert(r.confidence > 0.5, `confidence ${r.confidence.toFixed(2)} should be > 0.5`);
    return `scoreFake ${r.scoreFake.toFixed(2)}, correlation ${r.correlation.toFixed(2)}`;
  });
  await check(out, "sync", "unrelated lips: scoreFake > 0.6", async () => {
    if (d.sync.isMock) return "skipped (mock)";
    const r = feed(unrelatedAperture(10));
    assert(r, "getSync() returned null after 10 s of speech");
    assert(r.scoreFake > 0.6, `scoreFake ${r.scoreFake.toFixed(2)} should be > 0.6 for unrelated lips`);
    return `scoreFake ${r.scoreFake.toFixed(2)}, correlation ${r.correlation.toFixed(2)}`;
  });
  await check(out, "sync", "reset() returns to null", async () => { d.sync.reset(); assert(d.sync.getSync() === null, "getSync() must be null after reset()"); });

  // ---------------- challenge ----------------
  await check(out, "challenge", "init and poll() is null before start", async () => {
    await withTimeout(d.challenge.init(init), 30000, "challenge.init");
    assert(d.challenge.poll() === null, "poll() must be null before start()");
  });
  await check(out, "challenge", "clean yaw sweep passes", async () => {
    if (d.challenge.isMock) return "skipped (mock)";
    const t0 = nowMs();
    d.challenge.start("turn_head_left_right", t0);
    for (const f of yawSweepFrames(t0, 5)) d.challenge.pushFrame(f);
    const r = d.challenge.poll();
    assert(r && r.state === "passed", `expected passed, got ${r ? r.state : "null"}`);
    assert(in01(r.artifactScore) && r.artifactScore < 0.4, `artifactScore ${r.artifactScore} should be low for a clean sweep`);
    d.challenge.cancel();
  });
  await check(out, "challenge", "constant yaw fails after the time limit", async () => {
    if (d.challenge.isMock) return "skipped (mock)";
    const t0 = nowMs();
    d.challenge.start("turn_head_left_right", t0);
    for (const f of constantYawFrames(t0, 13)) d.challenge.pushFrame(f);
    const r = d.challenge.poll();
    assert(r && r.state === "failed", `expected failed, got ${r ? r.state : "null"}`);
    d.challenge.cancel();
  });
  await check(out, "challenge", "quality collapse at large yaw gives artifactScore > 0.5", async () => {
    if (d.challenge.isMock) return "skipped (mock)";
    const t0 = nowMs();
    d.challenge.start("turn_head_left_right", t0);
    for (const f of yawSweepFrames(t0, 5, 10, 35, true)) d.challenge.pushFrame(f);
    const r = d.challenge.poll();
    assert(r, "poll() returned null");
    assert(r.artifactScore > 0.5, `artifactScore ${r.artifactScore.toFixed(2)} should be > 0.5`);
    d.challenge.cancel();
  });
  await check(out, "challenge", "cancel() makes poll() null", async () => {
    d.challenge.start("turn_head_left_right", nowMs());
    d.challenge.cancel();
    assert(d.challenge.poll() === null, "poll() must be null after cancel()");
  });

  // ---------------- text ----------------
  await check(out, "text", "init", async () => { await withTimeout(d.text.init(init), 30000, "text.init"); });
  const classify = (e: EmailInput) => d.text.classify(e);
  await check(out, "text", "benign email is safe", async () => {
    const r = await classify(benignEmail);
    assert(r.label === "safe" && r.risk < 0.4, `benign email got label ${r.label}, risk ${r.risk}`);
  });
  await check(out, "text", "phishing email is flagged with reasons", async () => {
    const r = await classify(phishingEmail);
    assert(r.label !== "safe" && r.risk > 0.6, `phishing email got label ${r.label}, risk ${r.risk}`);
    assert(r.reasons.length >= 1, "phishing result must include at least one reason");
    return `risk ${r.risk.toFixed(2)}, ${r.reasons.length} reasons, ${r.latencyMs.toFixed(1)} ms`;
  });

  return out;
}
```

### A.21 `packages/contracts/src/index.ts`
```ts
export * from "./types";
export * from "./messages";
export * from "./util";
export * from "./fixtures";
export * from "./selftest";
```

### A.22 `packages/contracts/tests/fixtures.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  benignEmail, constantYawFrames, energySeries, matchingAperture, phishingEmail, rms, silenceChunks,
  syntheticSpeechChunks, unrelatedAperture, yawSweepFrames,
} from "../src/index";

/** Reference best-lag Pearson correlation at 10 Hz (lags of +/- 4 bins = +/- 400 ms). */
function bestLagCorr(a: number[], b: number[], maxLag = 4): number {
  let best = -1;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const x = a.slice(Math.max(0, lag), a.length + Math.min(0, lag));
    const y = b.slice(Math.max(0, -lag), b.length + Math.min(0, -lag));
    const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    if (sxx > 1e-12 && syy > 1e-12) best = Math.max(best, sxy / Math.sqrt(sxx * syy));
  }
  return best;
}

describe("fixtures", () => {
  it("speech has energy and silence has none", () => {
    expect(syntheticSpeechChunks(1).every((c) => c.length === 1600)).toBe(true);
    expect(Math.min(...energySeries(syntheticSpeechChunks(5)))).toBeGreaterThan(0.01);
    expect(Math.max(...energySeries(silenceChunks(5)))).toBe(0);
    expect(rms(new Float32Array(0))).toBe(0);
  });
  it("matching aperture correlates with the audio energy, unrelated does not", () => {
    const e = energySeries(syntheticSpeechChunks(10));
    expect(bestLagCorr(e, matchingAperture(10))).toBeGreaterThan(0.8);
    expect(bestLagCorr(e, unrelatedAperture(10))).toBeLessThan(0.3);
  });
  it("yaw sweep reaches both signs; constant yaw does not move", () => {
    const yaws = yawSweepFrames(0, 5).map((f) => f.headPose.yawDeg);
    expect(Math.max(...yaws)).toBeGreaterThan(30);
    expect(Math.min(...yaws)).toBeLessThan(-30);
    expect(new Set(constantYawFrames(0, 2).map((f) => f.headPose.yawDeg)).size).toBe(1);
  });
  it("sample emails exist", () => {
    expect(benignEmail.links).toEqual([]);
    expect(phishingEmail.links.length).toBe(1);
  });
});
```

### A.23 `packages/mocks/package.json`
```json
{
  "name": "@sentinel/mocks",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": { "@sentinel/contracts": "workspace:*" }
}
```

### A.24 `packages/mocks/sentinel.assets.json`
```json
{ "assets": [] }
```

### A.25 `packages/mocks/src/index.ts`
```ts
import type {
  AudioDetector, AudioResult, ChallengeStatus, ChallengeType, ChallengeVerifier, EmailInput, FrameResult,
  InitOptions, Ms, SyncDetector, SyncResult, TextClassifier, TextResult, VisionDetector,
} from "@sentinel/contracts";
import { SAMPLE_RATE, rms } from "@sentinel/contracts";

/** Scripted fake-ness over time: low, ramp up, high, ramp down, low. */
export function scriptedScore(tRelMs: number): number {
  const t = tRelMs / 1000;
  if (t < 20) return 0.1;
  if (t < 30) return 0.1 + (0.7 * (t - 20)) / 10;
  if (t < 50) return 0.8;
  if (t < 60) return 0.8 - (0.7 * (t - 50)) / 10;
  return 0.1;
}

export function mockAudioDetector(): AudioDetector {
  const WINDOW_SAMPLES = 2 * SAMPLE_RATE;   // 2 s window and hop
  let n = 0, sumSq = 0, winStart: Ms | null = null, t0: Ms | null = null;
  return {
    isMock: true,
    async init(_o: InitOptions) {},
    async push(chunk, tsMs): Promise<AudioResult | null> {
      if (t0 === null) t0 = tsMs;
      if (winStart === null) winStart = tsMs;
      const r = rms(chunk);
      sumSq += r * r * chunk.length;
      n += chunk.length;
      if (n < WINDOW_SAMPLES) return null;
      const windowRms = Math.sqrt(sumSq / n);
      const end = winStart + (n * 1000) / SAMPLE_RATE;
      const res: AudioResult = {
        windowStartMs: winStart, windowEndMs: end,
        scoreFake: scriptedScore(end - t0), confidence: windowRms < 0.005 ? 0 : 0.9, latencyMs: 1,
      };
      n = 0; sumSq = 0; winStart = null;
      return res;
    },
    dispose() { n = 0; sumSq = 0; winStart = null; t0 = null; },
  };
}

export function mockVisionDetector(): VisionDetector {
  let t0: Ms | null = null;
  return {
    isMock: true,
    async init(_o: InitOptions) {},
    async processFrame(frame, tsMs): Promise<FrameResult> {
      if (t0 === null) t0 = tsMs;
      const blank = (frame as unknown as { __blank?: boolean })?.__blank === true;
      const t = (tsMs - t0) / 1000;
      if (blank) {
        return { tsMs, faceFound: false, mouthAperture: 0, headPose: { yawDeg: 0, pitchDeg: 0, rollDeg: 0 },
          faceOccluded: true, landmarkQuality: 0, handNearFace: false, latencyMs: 1 };
      }
      return {
        tsMs, faceFound: true, mouthAperture: 0.06 + 0.05 * (1 + Math.sin(2 * Math.PI * 2 * t)),
        headPose: { yawDeg: 3 * Math.sin(t), pitchDeg: 0, rollDeg: 0 },
        faceOccluded: false, landmarkQuality: 0.9, handNearFace: false, latencyMs: 1,
      };
    },
    dispose() { t0 = null; },
  };
}

export function mockSyncDetector(): SyncDetector {
  let first: Ms | null = null, last: Ms = 0;
  return {
    isMock: true,
    pushAudioEnergy(_rms, tsMs) { if (first === null) first = tsMs; last = tsMs; },
    pushFrame(_r) {},
    getSync(): SyncResult | null {
      if (first === null || last - first < 3000) return null;
      const score = scriptedScore(last - first - 3000);
      return { tsMs: last, scoreFake: score, confidence: 0.8, correlation: 0.6 - 0.5 * score, windowMs: 8000 };
    },
    reset() { first = null; last = 0; },
  };
}

export function mockChallengeVerifier(): ChallengeVerifier {
  let active: { c: ChallengeType; start: Ms; now: Ms } | null = null, t0: Ms | null = null;
  return {
    isMock: true,
    async init(_o: InitOptions) {},
    start(c, tsMs) { active = { c, start: tsMs, now: tsMs }; if (t0 === null) t0 = tsMs; },
    pushFrame(r) { if (active) active.now = r.tsMs; },
    poll(): ChallengeStatus | null {
      if (!active) return null;
      const high = scriptedScore(active.start - (t0 ?? active.start)) > 0.5;
      if (active.now - active.start < 4000) return { challenge: active.c, state: "pending", artifactScore: 0, evidence: "Mock: waiting" };
      return high
        ? { challenge: active.c, state: "failed", artifactScore: 0.8, evidence: "Mock: face broke down during the challenge" }
        : { challenge: active.c, state: "passed", artifactScore: 0.1, evidence: "Mock: challenge completed cleanly" };
    },
    cancel() { active = null; },
  };
}

export function mockTextClassifier(): TextClassifier {
  return {
    isMock: true,
    async init(_o: InitOptions) {},
    async classify(e: EmailInput): Promise<TextResult> {
      const text = `${e.subject} ${e.bodyText}`.toLowerCase();
      const hit = text.includes("urgent") || text.includes("verify");
      return hit
        ? { risk: 0.85, label: "phishing", reasons: ["Mock: urgent or verify wording"], latencyMs: 1 }
        : { risk: 0.05, label: "safe", reasons: [], latencyMs: 1 };
    },
  };
}
```

### A.26 `packages/mocks/tests/mocks.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { runContractSelfTest } from "@sentinel/contracts";
import {
  mockAudioDetector, mockChallengeVerifier, mockSyncDetector, mockTextClassifier, mockVisionDetector, scriptedScore,
} from "../src/index";

describe("scriptedScore", () => {
  it("follows the script", () => {
    expect(scriptedScore(0)).toBeCloseTo(0.1);
    expect(scriptedScore(25_000)).toBeCloseTo(0.45);
    expect(scriptedScore(40_000)).toBeCloseTo(0.8);
    expect(scriptedScore(55_000)).toBeCloseTo(0.45);
    expect(scriptedScore(70_000)).toBeCloseTo(0.1);
  });
});

describe("mocks pass the contract self-test", () => {
  it("all checks are ok", async () => {
    const results = await runContractSelfTest(
      { audio: mockAudioDetector(), vision: mockVisionDetector(), sync: mockSyncDetector(), challenge: mockChallengeVerifier(), text: mockTextClassifier() },
      {
        assetBase: "/",
        loadTestFace: async () => ({ __blank: false }) as unknown as ImageBitmap,
        loadBlankFrame: async () => ({ __blank: true }) as unknown as ImageBitmap,
      },
    );
    const failed = results.filter((r) => !r.ok);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
    expect(results.length).toBeGreaterThan(15);
  });
});
```

### A.27 `apps/harness/package.json`
```json
{
  "name": "@sentinel/harness",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@sentinel/contracts": "workspace:*",
    "@sentinel/audio-detector": "workspace:*",
    "@sentinel/text-classifier": "workspace:*",
    "@sentinel/vision-detector": "workspace:*",
    "@sentinel/sync-detector": "workspace:*",
    "@sentinel/challenge-verifier": "workspace:*"
  }
}
```

### A.28 `apps/harness/public/index.html`
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Sentinel harness</title>
  <style>
    body { font: 14px system-ui, sans-serif; margin: 24px; max-width: 1000px; }
    button { font: inherit; padding: 6px 12px; margin-right: 8px; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; }
    th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
    .ok { color: #0a7d2c; font-weight: 600; } .bad { color: #b00020; font-weight: 600; }
    #summary { margin-top: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Sentinel harness</h1>
  <p>Runs the five role modules through the shared contract self-test, in this browser. Modules still showing "(mock)" are the stubs.</p>
  <button id="run">Run self-test</button>
  <button id="copy" disabled>Copy results</button>
  <label><input type="checkbox" id="forcemock" /> force mocks for all modules</label>
  <div id="summary"></div>
  <table id="results"><thead><tr><th>Module</th><th>Check</th><th>Result</th><th>Detail</th><th>ms</th></tr></thead><tbody></tbody></table>
  <script type="module" src="harness.js"></script>
</body>
</html>
```

### A.29 `apps/harness/src/index.ts`
```ts
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
```

