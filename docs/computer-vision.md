# COMPUTER VISION MODULE: Computer Vision (Video Detective + Lip-Sync + Challenges)

Owner: Yash
Read first: `00-master-integration-doc.md` (contracts in section 4 are binding).

## START HERE: generate Vision Module with a coding agent

1. Make an empty folder (for example `sentinel/`). Inside it create `docs/` and put two files there: `00-master-integration-doc.md` and `computer-vision.md`.
2. Open a coding agent (Claude Code, Cursor agent, or similar) in that folder and allow it to run shell commands.
3. Fill in the **decision inputs** below (leave a line blank and the agent chooses a safe default and records it).
4. Paste the prompt below, and nothing else.
5. When the agent finishes, read its FINAL REPORT, do the human steps it lists, and send the tarball it made (`vision-module-<date>.tgz`) to **Aditya (Full-Stack Integration)**. You do not create a repository.
6. Later, Aditya pushes the whole project to GitHub. Then you clone it and continue on branches (`vision-module/<topic>`) with pull requests, inside your own folders only (master doc sections 0 and 18.8).

### Decision inputs (edit before you paste; blank means "agent decides and records it")
```
Use the MediaPipe hand landmarker for the cover/finger challenges (yes/no/decide): 
Path to a clear, well-lit face photo of a team member who agreed (for the self-test): 
Folder with your real and fake video clips (if you already have any): 
```

### The prompt (paste exactly; the lines above are filled in by you, the agent reads them from this document)
```
You are a coding agent working in an empty folder. docs/00-master-integration-doc.md and docs/computer-vision.md
describe the Sentinel project (a Chrome extension that detects deepfake voices and faces, and phishing emails, entirely
inside the browser). You are generating COMPUTER VISION MODULE: the vision detector, the lip-sync detector, and the challenge verifier.
Work autonomously. Do not ask me questions except in the cases listed in master doc section 17.2.
Follow the rules in master doc section 17.1 and finish with the final report in section 17.3.

Steps:
1. Read both documents completely, including the decision inputs at the top of the Vision Module document.
2. Create the scaffold exactly as in master doc Appendix A (all files, no edits). Then run:
   node scripts/make-stubs.mjs ; pnpm install ; pnpm verify:parts ; git init -b main && git add -A && git commit -m scaffold && git tag scaffold-baseline
   pnpm verify:parts must pass before you continue.
3. Generate Vision Module's deliverables as specified in Part B of the Vision Module document (B1 file list, B3 conventions, B4 vision
   detector, B5 sync detector, B6 challenge verifier, B8 evaluation layout), in the order of B10. Replace the stub folders
   packages/vision-detector, packages/sync-detector, packages/challenge-verifier completely (same folder and package names).
4. Install dependencies with exact versions (pnpm add -E @mediapipe/tasks-vision@<version> --filter @sentinel/vision-detector).
   Do NOT create any README file anywhere; your notes go in docs/vision-module/HANDOVER.md and docs/vision-module/MODEL_CARD.md only.
   Download the MediaPipe model files with the commands in Part C2 if you have network access; if not, list the download
   as a human step. Keep all MediaPipe calls behind src/landmarker.ts so the rest of the code is testable with an injected
   fake landmarker in node (vitest).
5. The sync detector and the challenge verifier must pass the self-test checks in master doc section 11.2 using the shared
   fixtures from @sentinel/contracts; write your vitest tests to run those same scenarios.
6. After each package run: pnpm vitest run packages/<name> and then pnpm verify:parts. Fix failures before moving on.
7. When done: node scripts/check-ownership.mjs 2 must pass. Pack the handover with the Vision Module command in master doc 18.4.
8. Print the FINAL REPORT (master doc 17.3). In section 6 list the human steps: add assets/selftest/face.jpg, open the
   harness in Chrome and run the self-test (pnpm harness) to check the real MediaPipe code, make real and fake clips,
   calibrate the sync thresholds on them, send the tarball to Aditya (Full-Stack Integration).
```

---

## 1. Your mission

Build the part of the system that watches the caller's face and decides whether it behaves like a real person speaking. You deliver face tracking, a lip-sync score, and a checker that verifies the "challenge" the user asks the caller to perform. Everything runs **inside the browser**.

You deliver three packages and some model files:
- `packages/vision-detector` implementing `VisionDetector`
- `packages/sync-detector` implementing `SyncDetector`
- `packages/challenge-verifier` implementing `ChallengeVerifier`
- Model files in `packages/vision-detector/assets/` (`face_landmarker.task`, optional `hand_landmarker.task`, `selftest/face.jpg`), declared in `sentinel.assets.json`, plus `docs/vision-module/MODEL_CARD.md` (master doc section 10.1)
- Eval scripts in `eval/scripts/` for the vision signals
- Face-swap fake clips for the shared test set

## 2. Interfaces you must implement (from the master doc, section 4)

```ts
export interface VisionDetector { init(opts: InitOptions): Promise<void>; processFrame(frame: ImageBitmap, tsMs: number): Promise<FrameResult>; dispose(): void; }
export interface FrameResult {
  tsMs: number; faceFound: boolean; mouthAperture: number;
  headPose: { yawDeg: number; pitchDeg: number; rollDeg: number };
  faceOccluded: boolean; landmarkQuality: number; handNearFace: boolean; latencyMs: number;
}
export interface SyncDetector {
  pushAudioEnergy(rms: number, tsMs: number): void;
  pushFrame(r: FrameResult): void;
  getSync(): { tsMs: number; scoreFake: number; confidence: number; correlation: number; windowMs: number } | null;
  reset(): void;
}
export type ChallengeType = 'turn_head_left_right' | 'cover_half_face' | 'raise_fingers';
export interface ChallengeVerifier {
  init(opts: InitOptions): Promise<void>;
  start(c: ChallengeType, tsMs: number): void;
  pushFrame(r: FrameResult): void;
  poll(): { challenge: ChallengeType; state: 'pending' | 'passed' | 'failed'; artifactScore: number; evidence: string } | null;
  cancel(): void;
}
```
Exports required: `createVisionDetector()`, `createSyncDetector()`, `createChallengeVerifier()` from their packages (names in master doc section 2.2).

Rules:
- `scoreFake` is 0 (real) to 1 (fake), always. No face or not enough speech means `confidence: 0` or a `null` result, never a guess.
- Timestamps come from the pipeline (shared clock). Do not use your own timers for scoring; use the timestamps you are given.
- `mouthAperture` is **normalized** (inner-lip gap divided by face height) so it works at any camera distance. 0 when no face.
- `ImageBitmap` frames are about 5 fps and at most 480 px wide (decoded by the pipeline from JPEG). Do not call `close()` on the bitmap; the pipeline owns it.
- Always fill `latencyMs` with measured time.
- Never use the network. Load files only from `opts.assetBase` (face model at `assetBase + "models/vision/face_landmarker.task"`, MediaPipe WASM at `assetBase + "mediapipe/wasm/"`).

## 3. Video Detective: plan

### Step A: face tracking (first spike)
- Use MediaPipe Face Landmarker in the browser (WASM, WebGPU if available). Check the current package and licence.
- Frames arrive as `ImageBitmap` at about 5 fps, at most 480 px wide (constants in the contracts). Test whether landmarks stay stable at that size.
- Compute from landmarks: mouth aperture, head pose (yaw, pitch, roll from the facial transformation matrix or from landmark geometry), `faceFound`, `landmarkQuality`.
- Compute `faceOccluded` from landmark confidence and the proportion of the face visible. This feeds the "cover half your face" challenge.
- Run on the offscreen document's main thread first (a hidden page separate from the Meet tab). Move to a Web Worker only if you measure jank.

### Step B: clean the signal
- Smooth aperture lightly (for example a short median filter). Do not over-smooth, you need the fast open/close of plosives.
- Ignore frames where the face is not found or the pose is extreme.
- Handle multiple faces: pick the largest face and keep it consistent across frames.

## 4. Lip-sync score (SyncDetector): plan

A full lip-sync model such as SyncNet is too heavy for a short hackathon build, so we use a simple, explainable signal.

- Full-Stack Integration pushes the **audio energy envelope** (RMS per short frame) on the same clock.
- You maintain a sliding window (start at 5-8 s, tune it) of `mouthAperture` and audio energy, resample both to a common rate, then compute the correlation, optionally over a small range of time lags to absorb call delay. Real speech should show a clear positive relationship, and a lip-sync mismatch lowers it.
- Convert correlation to `scoreFake` using a threshold you calibrate on real clips. Report `confidence` based on: how much speech was in the window, face found ratio, and landmark quality. **Return `null` until there is enough speech**, instead of guessing.
- Extra cheap signals if time allows (each must stay optional and independent): blink rate, head-pose jitter, face-edge flicker. Only include one if it measurably helps on your clips.
- Test the known weak cases: caller muted, caller listening while the other person talks, very quiet speech, video lag. Make sure these do not produce false alarms.

## 5. Challenge verification (ChallengeVerifier): plan

The arbiter asks the user to request a challenge from the caller. You decide what happened.

Start with the two that use signals you already have, then add the third only if time allows:

| Challenge | What to measure | Failure sign for a deepfake |
|---|---|---|
| `turn_head_left_right` | Yaw range over about 5 s; landmark stability while turning | Landmark quality drops, face shape warps or flickers at large yaw, identity breaks |
| `cover_half_face` | `faceOccluded` goes true, then recovers | Face-swap overlay stays on top of the hand, or visibly glitches at the occlusion edge |
| `raise_fingers` | Optional hand landmark check (MediaPipe Hands) | Hand near the face makes the face region distort |

- `state`: `pending` while waiting, `passed` if the caller did the action and the face stayed clean, `failed` if the action was not done in time.
- `artifactScore`: 0 means the face stayed clean, 1 means obvious breakdown. This is the key number the arbiter uses.
- `evidence`: a short human-readable string (for example "yaw reached 40 degrees, landmark quality fell to 0.3") that the overlay can show.
- Calibrate on real people doing the challenge, then on your face-swap clips. Expect that good face-swap tools often hold up at moderate head turns, so the challenge is more useful at large angles or with hand occlusion.

## 6. Face-swap fakes for the shared test set

You make the fake video the team needs for testing and the demo.
- Use only **your own face** or someone who has agreed. Never swap in a real third party.
- Check tool setup and licences yourself (first spike). A real-time open-source face-swap tool through a virtual camera is the likely path.
- Produce at least 10 labelled fake clips and 10 real clips (20-30 s each), including head turns, hand-over-face, fast speech, and different lighting.
- Coordinate with Audio Module so the same session can contain both swapped video and cloned audio.
- Add each clip to `eval/clips/labels.csv`. Record a fallback session for the demo.

## 7. Order of work for Vision Module

Work through these in order at your own pace. The master doc (section 12) says which milestone each step feeds.

| Step | Task | Done when |
|---|---|---|
| 1 | Landmarks running on a video file and on a live Meet video | Aperture and pose plotted from a clip (M0) |
| 2 | `vision-detector` v0 behind the interface | Harness self-test green for vision (M2, first handover) |
| 3 | `sync-detector` v0, calibrate on real clips | Correlation clearly differs between speech and silence |
| 4 | `challenge-verifier` (head turn and occlusion) | Passes on real people, reacts on your fakes (second handover, v1) |
| 5 | Fix live-Meet issues, optional extra signals, help label clips | Works on a real Meet call |
| 6 | Face-swap fakes, holdout evaluation | Numbers handed to Full-Stack Integration (final handover, M4) |
| 7 | Demo rehearsal, fallback recording | Fallback video saved (M5) |

## 8. Handoff checklist

- [ ] Harness self-test is green for `vision`, `sync`, and `challenge` (master doc section 11.2); `pnpm verify:parts` passes.
- [ ] `assets/` holds every file named in `sentinel.assets.json`; `docs/vision-module/MODEL_CARD.md` complete (master doc section 10.1).
- [ ] Recommended thresholds for `scoreFake` (sync) and `artifactScore` (challenges).
- [ ] Latency table: ms per frame by backend and frame size.
- [ ] Eval report: clip counts, detection rate, false positive rate, failure cases.
- [ ] Description of which challenge works best against which fake tool.
- [ ] Face-swap setup notes (in `docs/vision-module/HANDOVER.md`) and fallback video.

## 9. Things to ask other roles

- Full-Stack Integration: the frame size and fps defaults (in the contracts) and the harness that replays a video with audio.
- Audio Module: nothing blocking; confirm the audio energy envelope is computed on the same stream and clock.

## 10. Risks specific to you

| Risk | Mitigation |
|---|---|
| Lip-sync correlation too noisy | Longer window, lag search, combine with pose and occlusion signals, return `null` when unsure |
| Low-res frames hurt landmarks | Test frame sizes in the first spike, raise size only if budget allows |
| False alarms from muted or listening callers | Gate on speech presence and face-found ratio |
| Good face-swaps pass the challenges | Use stronger challenges (large yaw, hand occlusion), report honestly |
| Slow inference | Lower fps, smaller model, WebGPU, worker thread |

---

# PART B: BUILD SPEC (generation-ready)

Use this part to generate your code, whether by hand or with an AI tool. Everything here is binding unless the master doc says otherwise. Paste the master doc, this whole doc, and the prompt at the end into your code assistant.

## B1. What you deliver (and nothing else)

```
packages/vision-detector/
  package.json  sentinel.assets.json
  assets/face_landmarker.task  assets/hand_landmarker.task (optional)  assets/selftest/face.jpg
  src/index.ts        exports createVisionDetector()
  src/detector.ts     VisionDetector implementation
  src/landmarker.ts   MediaPipe setup (FilesetResolver, FaceLandmarker, optional HandLandmarker)
  src/geometry.ts     aperture, head pose, face box, hand coverage (pure functions)
  src/quality.ts      landmarkQuality and jitter tracking (pure)
  tests/*.test.ts
packages/sync-detector/
  package.json  sentinel.assets.json ({ "assets": [] })
  src/index.ts        exports createSyncDetector()
  src/window.ts  src/correlate.ts  src/calibration.json
  tests/*.test.ts
packages/challenge-verifier/
  package.json  sentinel.assets.json ({ "assets": [] })
  src/index.ts        exports createChallengeVerifier()
  src/head-turn.ts  src/cover.ts  src/fingers.ts  src/artifact.ts
  tests/*.test.ts
colab/vision/   eval/vision/   eval/clips/labels/vision-eval.csv
docs/vision-module/HANDOVER.md   docs/vision-module/MODEL_CARD.md       (the only documentation: NO README anywhere in your folders)
```

`sentinel.assets.json` for vision:
```json
{ "assets": [
  { "from": "assets", "to": "models/vision", "match": "\\.task$" },
  { "from": "assets/selftest", "to": "selftest" },
  { "from": "node_modules:@mediapipe/tasks-vision/wasm", "to": "mediapipe/wasm" }
] }
```
(The `.task` files are copied by the first line; `selftest/face.jpg` is for the harness self-test only.)

## B2. First spike

1. MediaPipe Face Landmarker runs in the browser on a video file, **using only bundled files** (no CDN). Confirm the current package name, API, and licence in its documentation.
2. Plot `mouthAperture` and head pose over a clip of someone talking and turning their head. Confirm they behave sensibly at 480 px width.
3. Decide whether to use the hand landmarker (for `handNearFace` and the cover/fingers challenges) or skip it. Write the decision in `docs/vision-module/MODEL_CARD.md`.
4. Tell the team right away. If MediaPipe cannot load from bundled files, say so at M1.

## B3. Conventions (binding)

- **Head pose signs:** `yawDeg > 0` means the person turns their face toward the **right side of the image**; `pitchDeg > 0` means looking up; `rollDeg > 0` means the head tilts clockwise on screen. Angles in degrees. If your pose code gives the opposite sign, flip it so this holds, and test it on a clip.
- **Mouth aperture:** `dist(inner upper lip, inner lower lip) / dist(top of face, chin)`. For the 478-point MediaPipe face mesh use landmark indices 13 (upper inner lip), 14 (lower inner lip), 10 (top of face), 152 (chin); mouth corners are 61 and 291. Verify indices against the documentation before relying on them.
- **No face:** `faceFound: false`, `mouthAperture: 0`, angles 0, `landmarkQuality: 0`.
- **Multiple faces:** track the largest face; keep following it across frames; ignore others.

## B4. VisionDetector specification

**`init(opts)`:**
1. `FilesetResolver.forVisionTasks(opts.assetBase + "mediapipe/wasm/")`.
2. Create `FaceLandmarker` with `modelAssetPath = opts.assetBase + "models/vision/face_landmarker.task"`, `runningMode: "VIDEO"`, `numFaces: 2` (so you can pick the largest), `outputFacialTransformationMatrixes: true`. Delegate `"GPU"` if `opts.preferWebGPU` and it works, else `"CPU"`; record which was used.
3. If using hands: create `HandLandmarker` the same way, `numHands: 2`.
4. Warm up with one call on a blank canvas.

**`processFrame(frame, tsMs)`:**
- MediaPipe video mode needs **strictly increasing integer millisecond timestamps**. Keep an internal counter: `mpTs = max(lastMpTs + 1, Math.round(tsMs))`.
- Run face (and hand) detection, pick the largest face by bounding-box area.
- Compute `mouthAperture`, head pose (from the facial transformation matrix; fall back to landmark geometry if it is missing), `landmarkQuality`, and hand overlap.
- `handNearFace = true` if any hand landmark lies inside the face box expanded by 20%.
- `faceOccluded = !faceFound || handCoverage > 0.35`, where `handCoverage` is the fraction of the face box area covered by the union of hand boxes.
- Wrap everything in try/catch: on error return the "no face" result with the measured `latencyMs` and count the error. Never throw out of `processFrame`.
- Measure `latencyMs` around the whole call.

**`landmarkQuality` (first version, you may tune):**
- Keep the previous frame's positions of 8 key points (nose tip, both eye corners, both mouth corners, chin, forehead, nose bridge), each normalized by face height.
- `jitter` = median over key points of the frame-to-frame displacement after subtracting the displacement of the face center.
- `stability = 1 - clamp(jitter / 0.03, 0, 1)`; `sizeFactor = clamp(faceHeightPx / 80, 0, 1)`.
- `landmarkQuality = stability * sizeFactor`. First frame after a face appears: quality 0.5.

**`dispose()`:** close the landmarkers, safe to call twice.

## B5. SyncDetector specification (`packages/sync-detector`)

**Resolution limit (state it in `docs/vision-module/HANDOVER.md`):** at 10 frames per second, one frame is 100 ms, so the check sees the mouth opening and closing at roughly word and phrase level. It cannot reliably see short sounds such as a "P" lip closure. Do not claim phoneme-level lip-sync detection; report what was measured.


Inputs: `pushAudioEnergy(rms, tsMs)` every 100 ms, `pushFrame(FrameResult)` about every 200 ms.

1. Keep a sliding window of **8 s** of both signals.
2. Resample both to a common **10 Hz** grid by averaging within each 100 ms bin (frames without a face are skipped, not zero-filled).
3. Mark a bin as **speech** if audio RMS is above `speechRms` (calibrate; start at 0.01).
4. If speech bins in the window total less than **3 s**, or the face-found ratio is below 0.6, `getSync()` returns `null`.
5. Normalize both series (subtract mean, divide by standard deviation; if the standard deviation is near zero, return `null`).
6. Search lags from **-400 ms to +400 ms** in 100 ms steps (to absorb call delay and capture offsets); `correlation` = the **maximum Pearson r** over the lags.
7. `scoreFake = clamp((rHigh - correlation) / (rHigh - rLow), 0, 1)` with `rHigh = 0.5`, `rLow = 0.1` as starting values. Store calibrated values in `src/calibration.json` and document how they were obtained.
8. `confidence = min(1, speechSeconds / 6) * faceFoundRatio * meanLandmarkQuality`.
9. Return `tsMs` = the latest sample time; `windowMs` = the window length used.
10. `reset()` clears all buffers.

Scope: the captured tab audio is the **remote** audio, so the sync check is valid for **1-on-1 calls** (one remote speaker, one tracked face). In a group call the audio mixes several people and the tracked face may be silent while someone else talks. For the demo, support 1-on-1 only, and say so in `docs/vision-module/HANDOVER.md` and the overlay ("Works best in 1-on-1 calls").

Cases that must **not** raise false alarms (test each and report): the caller is muted or silent (no speech bins, so return `null`), very quiet speech, background music or noise on the call (gate on speech-like energy and do not score when speech is not clear), and video lag (covered by the lag search).

Tests: synthetic correlated signals give a low `scoreFake`; independent noise gives a high one; fewer than 3 s of speech gives `null`; a lag offset of 300 ms still correlates; `reset()` works.

## B6. ChallengeVerifier specification (`packages/challenge-verifier`)

`start(c, tsMs)` begins a challenge; frames are fed through `pushFrame`; `poll()` returns the current status or `null` when no challenge is active. Timeout for all challenges: **12 s** after `start` (then `state: "failed"`, evidence explains what was missing).

**Baseline:** during the 2 s before `start`, the verifier keeps a rolling mean of `landmarkQuality` for frames with `|yaw| < 10` as `Q0`. If there is no baseline yet, use 0.8.

### `turn_head_left_right`
- Track yaw. `passed` when yaw reached **at least +25° and at most -25°** (either order) within the time limit, with the face found for at least 70% of the frames.
- `artifactScore = clamp((Q0 - Qbig) / 0.4, 0, 1)` where `Qbig` is the mean `landmarkQuality` over frames with `|yaw| >= 20°`. Add a second term for the largest jump in mouth aperture or in face-center position between consecutive frames at large yaw relative to the baseline; take the maximum of the two terms.
- `evidence`: for example `"yaw reached +38 and -41 degrees; landmark quality fell from 0.82 to 0.35"`.

### `cover_half_face`
- `passed` when `faceOccluded` (or hand coverage above 0.35) holds for at least **0.8 s** and the face is found again afterwards.
- Starting heuristic for `artifactScore`: a real hand in front of a real face reduces landmark quality and moves landmarks; a face-swap overlay often keeps rendering the face on top of the hand or glitches at its edge. Use two terms: `qualityStaysHigh` (mean quality during occlusion stays above 0.8 while coverage is above 0.5) and `edgeJitter` (jitter spike at the moment coverage crosses 0.35, relative to baseline). `artifactScore = max` of both terms. **Calibrate on real people and on your fakes; this is experimental and `docs/vision-module/HANDOVER.md` must say how reliable it was.**

### `raise_fingers` (optional, only if the hand landmarker works)
- `passed` when a hand is near the face (`handNearFace`) for at least 1 s. `artifactScore` computed like `cover_half_face`. If you skip this challenge, `start("raise_fingers")` immediately returns a `failed` status with evidence `"not supported"`, and **tell Full-Stack Integration** so the arbiter skips it.

`cancel()` clears the active challenge. `evidence` is always a short plain sentence.

Tests with synthetic `FrameResult` sequences (use fixtures from `@sentinel/contracts`): a clean yaw sweep passes with a low `artifactScore`; a sweep whose quality collapses at large yaw gives `artifactScore > 0.5`; constant yaw gives `failed` after 12 s; `cancel()` returns `poll()` to `null`.

## B7. Face-swap fakes and test clips

- Use only your own face or someone who agreed. Never use a real third party.
- Verify tool setup and licences yourself (an open-source real-time face-swap tool plus a virtual camera is the likely path).
- At least 10 fake and 10 real clips, 20-30 s each: talking, head turns left and right, hand over half the face, fast speech, dim and bright light, glasses on and off.
- Coordinate with Audio Module so some sessions contain swapped video **and** cloned voice.
- Record a fallback session for the demo before the freeze (M5).
- List clips in `eval/clips/labels/vision-eval.csv`.

## B8. Evaluation layout

```
colab/vision/01_landmark_explore.ipynb       landmarks, aperture, pose plots per clip
colab/vision/02_sync_calibration.ipynb       choose speechRms, rLow, rHigh from real clips
eval/vision/run_eval.py or run_eval.ts       per clip: sync score, challenge results
eval/vision/report.md                        detection rate, false positive rate, failures per challenge type
```

## B9. Acceptance criteria

- [ ] `pnpm verify:parts` passes with your folders in place.
- [ ] Browser self-test is green for `vision`, `sync`, and `challenge`.
- [ ] Median `processFrame` time at or under 60 ms at 480 px width (or a documented table of what was tried).
- [ ] Sync: low false-alarm rate on real speech, including a muted caller and a quiet caller; numbers in `report.md`.
- [ ] Head-turn challenge works on real people; behaviour against your best fake is reported honestly.
- [ ] `docs/vision-module/HANDOVER.md` (template in master doc 17.5) and `docs/vision-module/MODEL_CARD.md` complete; `assets/` has every file in `sentinel.assets.json`.
- [ ] No network calls (`pnpm check:privacy` passes).
- [ ] Clips made and listed in `labels/vision-eval.csv`; fallback recording saved.

## B10. Generation order (the agent works through these in order, running tests after each step)

1. `geometry.ts` (aperture, head pose from a matrix, face box, hand coverage) and tests with synthetic landmarks.
2. `quality.ts` (jitter, `landmarkQuality`) and tests.
3. `landmarker.ts` (MediaPipe setup, bundled paths only).
4. `detector.ts` and `index.ts` for the vision package, with an injected fake landmarker for tests.
5. Sync package: `window.ts`, `correlate.ts`, `index.ts`, calibration file, tests.
6. Challenge verifier: `head-turn.ts`, `artifact.ts`, `cover.ts`, `fingers.ts`, `index.ts`, tests.
7. `docs/vision-module/HANDOVER.md`, `docs/vision-module/MODEL_CARD.md`, `sentinel.assets.json` files (no README).
8. Run `pnpm verify:parts`, then the browser self-test in the harness, and fix.

## B11. Prompt for your code assistant

The prompt is in the **START HERE** block at the top of this document. Use that one.

---

# PART C: COMMANDS AND SNIPPETS (Vision Module)

Starting points to adapt. Check library names and options against the current documentation of each tool.

## C1. Prepare clips at the size the extension will really send
```bash
ffmpeg -i eval/clips/raw/clip01.mp4 -vf "fps=10,scale=480:-2" -c:v libx264 -crf 20 eval/clips/proc/clip01.mp4
```
Test and tune on these 480 px, 10 fps versions, not on the originals.

## C2. Get the MediaPipe model files
```bash
mkdir -p packages/vision-detector/assets/selftest
curl -L -o packages/vision-detector/assets/face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
curl -L -o packages/vision-detector/assets/hand_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
```
Verify the URLs and licences in the current MediaPipe documentation. Add a clear, well-lit photo of a team member who agreed as `assets/selftest/face.jpg`.

## C3. Browser setup skeleton (`src/landmarker.ts`)
```ts
import { FilesetResolver, FaceLandmarker, HandLandmarker } from "@mediapipe/tasks-vision";

export async function createLandmarkers(assetBase: string, preferGPU: boolean, useHands: boolean) {
  const fileset = await FilesetResolver.forVisionTasks(assetBase + "mediapipe/wasm/");
  const face = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: assetBase + "models/vision/face_landmarker.task", delegate: preferGPU ? "GPU" : "CPU" },
    runningMode: "VIDEO", numFaces: 2, outputFacialTransformationMatrixes: true,
  });
  const hands = useHands
    ? await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: assetBase + "models/vision/hand_landmarker.task", delegate: preferGPU ? "GPU" : "CPU" },
        runningMode: "VIDEO", numHands: 2,
      })
    : null;
  return { face, hands };
}
// per frame:  const r = face.detectForVideo(bitmap, mpTs);   r.faceLandmarks[0], r.facialTransformationMatrixes[0]
```
If the GPU delegate fails to start, retry with `"CPU"` and record which one ran.

## C4. Pure geometry helpers (`src/geometry.ts`, adapt and test)
```ts
type P = { x: number; y: number; z?: number };
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
export function mouthAperture(lm: P[]): number {                // indices: verify against the MediaPipe face mesh docs
  const faceH = dist(lm[10], lm[152]);
  return faceH > 1e-6 ? dist(lm[13], lm[14]) / faceH : 0;
}
export function faceBox(lm: P[]) {
  const xs = lm.map(p => p.x), ys = lm.map(p => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
```
Landmarks from MediaPipe are normalized 0..1 of the image; convert aspect ratio before measuring distances (multiply x by width and y by height) or the aperture will change with the video's shape.

## C5. Sync calibration snippet (Colab)
```python
import numpy as np
def best_lag_corr(a, b, max_lag=4):            # both series at 10 Hz, so max_lag=4 means +/-400 ms
    best = -1.0
    for lag in range(-max_lag, max_lag + 1):
        x = a[max(0, lag): len(a) + min(0, lag)]
        y = b[max(0, -lag): len(b) + min(0, -lag)]
        if len(x) > 5 and x.std() > 1e-6 and y.std() > 1e-6:
            best = max(best, float(np.corrcoef(x, y)[0, 1]))
    return best
# For every real clip, slide an 8 s window, compute best_lag_corr(aperture, audio_energy); the distribution gives you rLow and rHigh.
# Repeat on fake clips. Save the chosen values in packages/sync-detector/src/calibration.json and describe the evidence in `docs/vision-module/HANDOVER.md`.
```

## C6. Commands you will run all the time
```bash
pnpm vitest run packages/vision-detector packages/sync-detector packages/challenge-verifier
pnpm verify:parts
pnpm harness        # open http://localhost:5173, press "Run self-test", then replay your clips and watch the signals
```
Handover and integrate commands: master doc sections 18.4 and 18.5.
