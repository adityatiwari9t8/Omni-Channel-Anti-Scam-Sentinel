# ROLE 1: Machine Learning (Audio Detective + Phishing Text)

Owner: Utkarsh
Read first: `00-master-integration-doc.md` (contracts in section 4 are binding).

## START HERE: generate Role 1 with a coding agent

1. Make an empty folder (for example `sentinel-role1/`). Inside it create `docs/` and put two files there: `00-master-integration-doc.md` and `01-role1-ml-audio.md`.
2. Open a coding agent (Claude Code, Cursor agent, or similar) in that folder and allow it to run shell commands.
3. Fill in the **decision inputs** below (leave a line blank and the agent chooses a safe default and records it).
4. Paste the prompt below, and nothing else.
5. When the agent finishes, read its FINAL REPORT, do the human steps it lists, and send the tarball it made (`role1-<date>.tgz`) to **Aditya (Role 3)**. You do not create a repository.
6. Later, Aditya pushes the whole project to GitHub. Then you clone it and continue on branches (`role1/<topic>`) with pull requests, inside your own folders only (master doc sections 0 and 18.8).

### Decision inputs (edit before you paste; blank means "agent decides and records it")
```
Audio model to use (name + download URL), or blank for the placeholder model: 
Do you have a GPU or Colab to train/export with (yes/no): 
Folder with your real and fake audio clips (if you already have any): 
Phishing dataset you are allowed to use (name/path), or blank for rules-only: 
```

### The prompt (paste exactly; the lines above are filled in by you, the agent reads them from this document)
```
You are a coding agent working in an empty folder. docs/00-master-integration-doc.md and docs/01-role1-ml-audio.md
describe the Sentinel project (a Chrome extension that detects deepfake voices and faces, and phishing emails, entirely
inside the browser). You are generating ROLE 1: the audio detector and the phishing text classifier.
Work autonomously. Do not ask me questions except in the cases listed in master doc section 17.2.
Follow the rules in master doc section 17.1 and finish with the final report in section 17.3.

Steps:
1. Read both documents completely, including the decision inputs at the top of the Role 1 document.
2. Create the scaffold exactly as in master doc Appendix A (all files, no edits). Then run:
   node scripts/make-stubs.mjs ; pnpm install ; pnpm verify:parts ; git init -b main && git add -A && git commit -m scaffold && git tag scaffold-baseline
   pnpm verify:parts must pass before you continue.
3. Generate Role 1's deliverables as specified in Part B of the Role 1 document (B1 file list, B3 audio algorithm,
   B4 feature parity if the model needs it, B5 tests, B6 text classifier, B7 colab/eval layout), in the order of B9.
   Replace the stub folders packages/audio-detector and packages/text-classifier completely (same folder and package names).
4. Model: if the decision inputs name an audio model, follow B2, fill docs/role1/MODEL_CARD.md and assets/meta.json for it.
   If blank, create the PLACEHOLDER model with the script in Part C1b (colab/audio/make_placeholder_model.py) so the package
   works end to end. Label the placeholder clearly in docs/role1/HANDOVER.md, docs/role1/MODEL_CARD.md, and the meta.json id, and write
   the exact steps to swap in a real model. Do NOT create any README file anywhere; notes go in docs/role1/ only.
5. After each package run: pnpm vitest run packages/<name> and then pnpm verify:parts. Fix failures before moving on.
6. When done: node scripts/check-ownership.mjs 1 must pass. Pack the handover with the Role 1 command in master doc 18.4.
7. Print the FINAL REPORT (master doc 17.3). In section 6 list the human steps: open the harness in Chrome and run the
   self-test (pnpm harness), make real and fake clips, replace the placeholder model if one was used, send the tarball.
```

---

## 1. Your mission

Build the part of the system that decides whether a voice is real or AI-generated, and a small classifier that flags phishing emails. Both must run **inside the browser**, fast enough for a live call.

You deliver two packages and some model files:
- `packages/audio-detector` implementing `AudioDetector`
- `packages/text-classifier` implementing `TextClassifier`
- Model files in `packages/audio-detector/assets/` (`model.onnx`, `meta.json`), declared in each package's `sentinel.assets.json`, plus `docs/role1/MODEL_CARD.md` (master doc section 10.1)
- Evaluation scripts in `eval/scripts/` for audio and text
- Voice-clone fake clips for the shared test set

## 2. Interface you must implement (from the master doc, section 4)

```ts
export interface AudioDetector {
  init(opts: InitOptions): Promise<void>;           // InitOptions = { assetBase: string; preferWebGPU?: boolean }
  push(chunk: Float32Array, tsMs: number): Promise<AudioResult | null>;
  dispose(): void;                                  // safe to call twice
}
export interface AudioResult { windowStartMs: number; windowEndMs: number; scoreFake: number; confidence: number; latencyMs: number; }

export interface TextClassifier { init(opts: InitOptions): Promise<void>; classify(e: EmailInput): Promise<TextResult>; }
```
Exports required: `createAudioDetector()` from `@sentinel/audio-detector` and `createTextClassifier()` from `@sentinel/text-classifier`.

Rules:
- `scoreFake` is 0 (real) to 1 (fake), always. `confidence` is 0 for silent or unusable windows.
- `chunk` is mono Float32 PCM at 16 kHz, 100 ms (1600 samples) per call. `tsMs` is the time of its first sample. `push` returns `null` until a hop completes, then one result per hop.
- Always fill `latencyMs` with measured time.
- Never use the network. Load files only from `opts.assetBase` (model at `assetBase + "models/audio/model.onnx"`, metadata at `assetBase + "models/audio/meta.json"`, ORT files at `assetBase + "ort/"`).
- The text classifier runs inside the Gmail content script: plain TypeScript, weights bundled by `import`, no WASM, no downloads.

## 3. Audio Detective: plan

### Step A: choose the model (first spike, go/no-go)
Candidates for a pre-trained anti-spoofing model: AASIST, RawNet2, or a small wav2vec-style detector. For each, check:
1. A pre-trained checkpoint actually exists and the **licence** allows our use.
2. It can be exported to ONNX and run in `onnxruntime-web` (WASM at least, WebGPU if possible).
3. Input spec: sample rate, window length, normalization.
4. Rough size and speed. Target under 300 ms per window on the demo laptop.

Record results in a small table. If nothing works in the first spike, switch to the fallback: a lighter model trained on spectral features (for example log-mel or LFCC) or a small CNN you train yourself on Colab. Tell the team immediately so the plan can adapt.

### Step B: browser pipeline
- Input arrives as mono Float32 PCM at 16 kHz (Role 3 resamples). Do not resample yourself unless the master doc changes.
- Window and hop come from config (start with about 2-4 s window, 50% overlap, or whatever the model needs).
- Do feature extraction (for example log-mel) in TypeScript or inside the ONNX graph. Test that your browser features match your Python features within a small tolerance. **This mismatch is the most common bug.** Write a unit test that compares them on a fixed clip.
- Run inference on the offscreen document's main thread first (it is a hidden page, separate from the Meet tab). Move to a Web Worker only if you measure jank.
- Output `scoreFake` and a `confidence`. A simple confidence: distance of the score from the decision boundary, reduced when the window is mostly silence. Add a silence gate, because voice detectors give junk on silence.

### Step C: make it fast
- Try fp32 first, then int8 or fp16 quantization. Record accuracy drop versus speed gain.
- Try WebGPU first, WASM as fallback.
- Keep a table: model, size, precision, backend, ms per window, accuracy on your clips. This table goes straight into the latency write-up.

### Step D: evaluate honestly
- Build or collect an evaluation set. Use public datasets for sanity checks (for example the ASVspoof family, subject to their licence), plus **our own clips** made with the cloning tool we will actually use in the demo.
- Report accuracy and EER, and a threshold recommendation for Role 3.
- Expect poor generalization to new cloning tools. Measure it and report it. Do not hide it.
- Give Role 3 a recommended threshold range, and a note on which clips fail and why.

## 4. Phishing text classifier: plan

Keep it small. It is the first thing the team cuts if behind, so do it after the audio package works.

- Input: `EmailInput` (subject, body, links, sender name and address).
- Start with **rules plus a small model**:
  - Rule signals: urgency phrases, credential or payment requests, mismatch between link text and `href` domain, sender display name versus address domain, lookalike domains, mismatched reply-to.
  - Small model: a tiny TF-IDF + logistic regression exported to JSON weights, or a small ONNX text model. Choose the simpler option that works.
- Output: `risk`, `label` (`safe`, `suspicious`, `phishing`), and `reasons` (plain-language strings the UI can show).
- Evaluate on a labelled phishing dataset you are allowed to use, plus about 20 hand-made examples. Report precision and false positive rate. Avoid claiming accuracy beyond what you measured.

## 5. Voice-clone fakes for the shared test set

You make the fake audio the team needs for testing and the demo.
- Use only **your own voice** or someone who has agreed. Never clone a third party.
- Check tool setup and licences yourself (first spike). Options include a real-time voice changer routed through a virtual audio cable, or pre-generated cloned speech.
- Produce at least 10 labelled fake clips and 10 real clips (20-30 s each) with the same speaker, with varied sentences including plosive sounds like "P" and "B".
- Add each to `eval/clips/labels.csv` (clip id, who, real/fake, tool, modality).
- Save the best live-demo audio setup as a short section in `docs/role1/HANDOVER.md` so the demo can be repeated.

## 6. Order of work for Role 1

Work through these in order at your own pace. The master doc (section 12) says which milestone each step feeds.

| Step | Task | Done when |
|---|---|---|
| 1 | Model candidates, licence check, ONNX export, runs in Colab and in the browser | Decision made and draft `docs/role1/MODEL_CARD.md` shared (M0) |
| 2 | `audio-detector` v0 behind the interface, with the silence gate | Harness self-test green for audio (M2, first handover) |
| 3 | Browser/Python feature parity test, first eval on clips, threshold | Scores separate real vs fake on your clips |
| 4 | Quantization and speed table, text classifier v0 | Latency table filled (second handover, v1) |
| 5 | Fix issues found on a live Meet call | Works on a live call |
| 6 | Finish the text classifier, or cut it | Cut/keep decided |
| 7 | Voice-clone fakes, holdout evaluation | Numbers handed to Role 3 (final handover, M4) |
| 8 | Demo rehearsal, fallback recording | Fallback audio saved (M5) |

## 7. Handoff checklist (what Role 3 and the team need from you)

- [ ] Harness self-test is green for `audio` and `text` (master doc section 11.2); `pnpm verify:parts` passes.
- [ ] `assets/` holds every file named in `sentinel.assets.json`; `docs/role1/MODEL_CARD.md` and `meta.json` complete (master doc sections 10.1, 10.2).
- [ ] Recommended `scoreFake` thresholds and confidence behaviour documented.
- [ ] Latency table (model, precision, backend, ms/window).
- [ ] Eval report: dataset sizes, accuracy, EER, failure cases.
- [ ] `TextClassifier` example inputs and expected outputs.
- [ ] Voice-clone setup notes (in `docs/role1/HANDOVER.md`) and fallback audio.

## 8. Things to ask other roles

- Role 3: exact audio capture format, chunk size, and clock source. Request a harness clip player early.
- Role 2: agree on how audio energy is computed for the sync score (Role 3 computes it, you just need to know it is the same stream).

## 9. Risks specific to you

| Risk | Mitigation |
|---|---|
| No suitable ONNX audio model | Fallback to spectral-feature model trained on Colab |
| Feature mismatch between Python and browser | Parity unit test as soon as `features.ts` exists |
| Model too slow | Quantize, shorter window, WebGPU, smaller model |
| Detector fires on silence or music | Silence gate and confidence reduction |
| Weak generalization | Honest report; the arbiter will lean on sync and challenges |

---

# PART B: BUILD SPEC (generation-ready)

Use this part to generate your code, whether by hand or with an AI tool. Everything here is binding unless the master doc says otherwise. Paste the master doc, this whole doc, and the prompt at the end into your code assistant.

## B1. What you deliver (and nothing else)

```
packages/audio-detector/
  package.json  sentinel.assets.json
  assets/model.onnx  assets/meta.json                     (model files, not in git)
  src/index.ts          exports createAudioDetector()
  src/detector.ts       AudioDetector implementation (state, windowing, scoring)
  src/ort.ts            onnxruntime-web session loader (backend fallback, warm-up)
  src/meta.ts           parse and validate meta.json
  src/windowing.ts      ring buffer, hop logic, timestamps
  src/gate.ts           silence gate and speech ratio
  src/score.ts          output tensor to scoreFake, confidence
  src/features.ts       only if the model needs log-mel/LFCC (pure TS)
  tests/*.test.ts       vitest, node
  tests/golden/         Python-made golden vectors (only if features.ts exists)
packages/text-classifier/
  package.json  sentinel.assets.json ({ "assets": [] })
  src/index.ts          exports createTextClassifier()
  src/rules.ts  src/tokenize.ts  src/model.ts  src/weights.json
  tests/*.test.ts
colab/audio/   colab/text/     eval/audio/   eval/text/   eval/clips/labels/role1.csv
docs/role1/HANDOVER.md   docs/role1/MODEL_CARD.md       (the only documentation: NO README anywhere in your folders)
```

`sentinel.assets.json` for audio:
```json
{ "assets": [
  { "from": "assets", "to": "models/audio" },
  { "from": "node_modules:onnxruntime-web/dist", "to": "ort", "match": "\\.(wasm|mjs)$" }
] }
```

## B2. First spike: decide the model (do not write the package before this)

For each candidate (AASIST, RawNet2, a small wav2vec-style detector, or a spectral-feature fallback you can train in Colab), fill one line:

| Candidate | Checkpoint exists? | Licence allows redistribution? | Exports to ONNX? | Runs in onnxruntime-web (WASM)? | WebGPU? | Size | ms per window | Notes |
|---|---|---|---|---|---|---|---|---|

Pick **one**, write `docs/role1/MODEL_CARD.md` and `assets/meta.json` (master doc sections 10.1 and 10.2), and tell the team right away. If nothing runs in the browser in the first spike, choose the fallback and say so at M1.

## B3. Algorithm specification (audio)

**Config source:** everything model-specific comes from `meta.json` (window and hop in samples, input and output names, `outputKind`, `fakeIndex`, features, normalization, silence threshold, `thresholdFake`). The code must not hard-code a model.

**`init(opts)`:**
1. `fetch(opts.assetBase + "models/audio/meta.json")` then validate every field (clear error messages).
2. Set `ort.env.wasm.wasmPaths = opts.assetBase + "ort/"` and `ort.env.wasm.numThreads = 1`.
3. Create the session from `opts.assetBase + "models/audio/model.onnx"` with execution providers `["webgpu", "wasm"]` if `opts.preferWebGPU`, else `["wasm"]`. If creation with WebGPU fails, fall back to WASM and record which backend was used.
4. Run one **warm-up inference** on zeros so the first real window is not slow.

**Windowing (`windowing.ts`):**
- Keep a ring buffer holding at least `windowSamples` samples. Track the absolute sample index of the first sample in the buffer and the `tsMs` of the first chunk.
- On each `push`, append the chunk. When the number of samples since the last emitted window is at least `hopSamples` **and** the buffer holds `windowSamples`, emit the latest `windowSamples` samples.
- `windowStartMs = tsMs of the window's first sample` (derived from the chunk timestamps: `firstChunkTs + sampleIndex / 16`); `windowEndMs = windowStartMs + windowSamples / 16`.
- If a timestamp gap larger than 250 ms appears between chunks (audio dropped), reset the buffer.
- Never run two inferences at once. If a window is ready while one is running, drop the older pending window (keep the newest) and count `dropped`.

**Silence gate (`gate.ts`):**
- Split the window into 20 ms sub-frames; `speechRatio` = fraction with RMS above `silenceRmsThreshold`.
- If `speechRatio < 0.3`: return `{ scoreFake: 0, confidence: 0 }` **without running the model** (saves time and avoids junk scores).

**Score conversion (`score.ts`), by `outputKind`:**
- `logits2`: softmax over the two logits, `scoreFake = p[fakeIndex]`.
- `logit1`: `scoreFake = sigmoid(logit)` (higher means fake).
- `sigmoid1`: `scoreFake = value`.
- `score1_bonafide`: `scoreFake = 1 - value`.
Clamp to [0, 1]; replace `NaN` with a result of `confidence: 0`.

**Confidence:** `confidence = gate * margin` where `gate = min(1, speechRatio / 0.6)` and `margin = min(1, |scoreFake - thresholdFake| / 0.25)`. Document this in `docs/role1/HANDOVER.md`; Aditya (Role 3) will weight by it.

**Latency:** measure with `performance.now()` around feature extraction plus inference. Report that as `latencyMs`.

**Errors:** an inference error returns `{ scoreFake: 0, confidence: 0 }`, increments an `errorCount`, and never throws out of `push`. Three errors in a row: log once through `console.warn` and keep going.

**`dispose()`:** release the session, clear buffers, safe to call twice.

## B4. Feature parity (only if the model uses log-mel, LFCC, or any feature step outside the graph)

This is the most common bug. Required:
1. A Python script `colab/audio/make_golden.py` that takes a fixed 4 s clip, runs your **training-time** feature extraction, and writes `tests/golden/input.f32` (raw samples), `tests/golden/features.f32`, and `tests/golden/meta.json` (shape, parameters).
2. A vitest test that runs `features.ts` on `input.f32` and compares with `features.f32` using a tolerance (start with max absolute error 1e-3, relative to the feature range) and fails with the worst index and value.
3. State the feature parameters (FFT size, hop, mel bins, window, normalization) in `docs/role1/MODEL_CARD.md`.

## B5. Tests you must write (vitest, node, pure logic)

- Windowing: right number of windows for a known number of chunks; correct `windowStartMs`/`windowEndMs`; reset on a timestamp gap; newest window kept when busy.
- Silence gate: all zeros gives `confidence: 0` and the model is not called (inject a fake session).
- Score conversion: each `outputKind`, plus `NaN` handling.
- Confidence: monotonic in margin; zero when the gate is zero.
- Feature parity (if applicable).
- `dispose()` twice does not throw.
The ONNX session is injected so these tests need no browser. The real-model checks run in the **browser self-test** (master doc 11.2).

## B6. Text classifier specification (build after audio works; cut first if behind)

**Runs in the Gmail content script. Plain TypeScript, weights imported from `src/weights.json`, no WASM, no network.**

Rule signals (each fires at most once; `points` are starting values to tune):

| Signal | Detection | Points |
|---|---|---|
| Urgency language | phrases such as "immediately", "within 24 hours", "account will be closed", "final notice" | 0.15 |
| Credential request | asks to "verify", "confirm", or "update" password, login, account, or card details | 0.25 |
| Payment pressure | gift cards, wire transfer, crypto, "invoice attached", unusual payment requests | 0.20 |
| Link text vs real target | visible link text shows one domain but `href` goes to another | 0.30 |
| Display-name spoof | sender name contains a known brand or a person's name but the address domain does not match that brand | 0.25 |
| Lookalike domain | link or sender domain within edit distance 2 of a known brand domain, or digits-for-letters ("paypa1") | 0.25 |
| Reply-to mismatch | `replyTo` domain differs from sender domain | 0.15 |
| Risky link | IP-address host, URL shortener, `@` in URL, punycode | 0.20 |
| Shouting subject | mostly capital letters or many exclamation marks | 0.05 |

Combine rule points: `ruleRisk = 1 - Π(1 - points_i)`.
Small model: TF-IDF plus logistic regression trained on a phishing dataset you are allowed to use; export vocabulary and weights to `src/weights.json`; `modelProb` is its output. If you cannot train one in time, set `modelProb = 0` and ship rules only (say so in `docs/role1/HANDOVER.md`).
Final: `risk = 1 - (1 - ruleRisk) * (1 - 0.6 * modelProb)`. Labels: `risk < 0.35` is `safe`, `< 0.65` is `suspicious`, else `phishing`.
`reasons`: one short plain sentence per fired rule (for example "The link text says paypal.com but goes to paypa1-secure.net"), strongest first, at most 4.
Known-brand list and the shortener list live in `src/rules.ts` as constants.
Tests: one benign email, one obvious phishing email, one lookalike-domain email, one empty body (must not throw), and the exact two samples used by the self-test (`benignEmail`, `phishingEmail` from `@sentinel/contracts` fixtures).

## B7. Colab and evaluation layout (outside the build)

```
colab/audio/01_explore.ipynb          load candidates, listen, sanity check
colab/audio/02_export_onnx.ipynb      export, verify ONNX output equals PyTorch output (max abs diff written down)
colab/audio/03_quantize.ipynb         fp32 vs int8/fp16 accuracy and size
colab/audio/make_golden.py            golden vectors (B4)
eval/audio/run_eval.py                runs the model on eval/clips, writes eval/audio/results.csv
eval/audio/report.md                  accuracy, EER, failure cases, recommended threshold
```
`results.csv` columns: `clip_id,label,score_fake,confidence`. Role 3 uses it to tune weights.

## B8. Acceptance criteria (you are done when all are true)

- [ ] `pnpm verify:parts` passes with your folders in place.
- [ ] Browser self-test is green for `audio` and `text`.
- [ ] Median latency per window at or under 300 ms on the demo laptop (or documented why not, with the table of options tried).
- [ ] `docs/role1/HANDOVER.md` (template in master doc 17.5) and `docs/role1/MODEL_CARD.md` and `meta.json` complete; `assets/` has every file in `sentinel.assets.json`.
- [ ] Eval report on your clips with a recommended threshold range, plus honest failure cases.
- [ ] No network calls (`pnpm check:privacy` passes).
- [ ] 10+ real and 10+ fake clips made and listed in `labels/role1.csv`, including words with "P" and "B" sounds, and a fallback recording for the demo.

## B9. Generation order (the agent works through these in order, running tests after each step)

1. `meta.ts` (schema and validation) and its tests.
2. `windowing.ts` and tests.
3. `gate.ts` and tests.
4. `score.ts` and tests.
5. `features.ts` and the golden-vector test (only if needed).
6. `ort.ts` (session, backend fallback, warm-up).
7. `detector.ts` and `index.ts` wiring, with an injected fake session for tests.
8. `docs/role1/HANDOVER.md`, `docs/role1/MODEL_CARD.md`, `sentinel.assets.json` (no README).
9. Text classifier: `rules.ts`, `tokenize.ts`, `model.ts`, `index.ts`, tests.
10. Run `pnpm verify:parts`, then the browser self-test in the harness, and fix.

## B10. Prompt for your code assistant

The prompt is in the **START HERE** block at the top of this document. Use that one.

---

# PART C: COMMANDS AND SNIPPETS (Role 1)

Starting points to adapt. Check library names and options against the current documentation of each tool.

## C1. Prepare clips (any clip to 16 kHz mono WAV)
```bash
ffmpeg -i eval/clips/raw/clip01.mp4 -ac 1 -ar 16000 eval/clips/wav/clip01.wav
```

## C1b. Placeholder model (so the package works end to end before a real model exists)
Save as `colab/audio/make_placeholder_model.py` and run from the repo root with `python colab/audio/make_placeholder_model.py` (needs `pip install onnx numpy`). It writes `packages/audio-detector/assets/model.onnx` and `meta.json`. The "detector" is **loudness only and is not a real deepfake detector**; it exists so the browser pipeline, the self-test, and the latency measurements work. Tested with onnx 1.23 and onnxruntime 1.31: it loads and runs.
```python
"""Creates a PLACEHOLDER audio 'detector' (loudness based, NOT a real deepfake detector) so the whole
pipeline can run end to end. Replace assets/model.onnx and assets/meta.json with a real model later.
Run from the repo root:  python colab/audio/make_placeholder_model.py
Needs: pip install onnx numpy
"""
import json, os
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

W = 32000          # 2 s at 16 kHz
OUT = os.path.join("packages", "audio-detector", "assets")
os.makedirs(OUT, exist_ok=True)

x = helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, W])
y = helper.make_tensor_value_info("output", TensorProto.FLOAT, [1, 1])
init = [
    numpy_helper.from_array(np.array([0.05], dtype=np.float32), "offset"),
    numpy_helper.from_array(np.array([8.0], dtype=np.float32), "gain"),
]
nodes = [
    helper.make_node("Abs", ["input"], ["a"]),
    helper.make_node("ReduceMean", ["a"], ["m"], axes=[1], keepdims=1),   # opset 13 style (axes is an attribute)
    helper.make_node("Sub", ["m", "offset"], ["s"]),
    helper.make_node("Mul", ["s", "gain"], ["g"]),
    helper.make_node("Sigmoid", ["g"], ["output"]),
]
graph = helper.make_graph(nodes, "placeholder_loudness", [x], [y], init)
model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
model.ir_version = 8
onnx.checker.check_model(model)
onnx.save(model, os.path.join(OUT, "model.onnx"))

meta = {
    "id": "PLACEHOLDER-loudness-not-a-real-detector",
    "sampleRate": 16000, "windowSamples": W, "hopSamples": 16000,
    "inputName": "input", "outputName": "output",
    "outputKind": "sigmoid1", "fakeIndex": 0,
    "features": "raw", "normalize": "none",
    "silenceRmsThreshold": 0.005, "thresholdFake": 0.5,
    "license": "none (generated locally)", "source": "colab/audio/make_placeholder_model.py",
}
json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), indent=2)
print("wrote", OUT, "(PLACEHOLDER model: replace before any real use)")
```
Everything that mentions this model (`HANDOVER.md`, `docs/role1/MODEL_CARD.md`, `meta.json` id) must say PLACEHOLDER. Replacing it means: put the real `model.onnx` and a matching `meta.json` in `assets/`, fill in `docs/role1/MODEL_CARD.md`, and re-run the self-test.

## C2. Export to ONNX and check it matches PyTorch (Colab)
```python
import torch, numpy as np, onnxruntime as ort
model.eval()
dummy = torch.zeros(1, WINDOW_SAMPLES)            # use the real input shape of your model
torch.onnx.export(model, dummy, "model.onnx", input_names=["input"], output_names=["output"], opset_version=17)

sess = ort.InferenceSession("model.onnx", providers=["CPUExecutionProvider"])
x = torch.randn(1, WINDOW_SAMPLES)
torch_out = model(x).detach().numpy()
onnx_out = sess.run(None, {"input": x.numpy()})[0]
np.testing.assert_allclose(torch_out, onnx_out, rtol=1e-3, atol=1e-4)     # write the max abs difference in docs/role1/MODEL_CARD.md
```

## C3. Quantize and compare (int8)
```python
from onnxruntime.quantization import quantize_dynamic, QuantType
quantize_dynamic("model.onnx", "model.int8.onnx", weight_type=QuantType.QInt8)
# Re-run eval with both files; record size, speed, and accuracy side by side. Ship the one you can justify.
```

## C4. Evaluation script skeleton (`eval/audio/run_eval.py`)
```python
import csv, glob, numpy as np, soundfile as sf, onnxruntime as ort, json
from sklearn.metrics import roc_curve

meta = json.load(open("packages/audio-detector/assets/meta.json"))
sess = ort.InferenceSession("packages/audio-detector/assets/model.onnx", providers=["CPUExecutionProvider"])
W, H = meta["windowSamples"], meta["hopSamples"]

def score_clip(wav):
    scores = []
    for s in range(0, max(1, len(wav) - W + 1), H):
        w = wav[s:s + W]
        if len(w) < W: break
        rms = np.sqrt(np.mean(w ** 2))
        if rms < meta["silenceRmsThreshold"]: continue            # same gate as the browser code
        out = sess.run(None, {meta["inputName"]: w[None, :].astype(np.float32)})[0].ravel()
        # convert out to scoreFake with the SAME rule as src/score.ts (outputKind in meta.json)
        scores.append(float(convert(out, meta)))
    return float(np.mean(scores)) if scores else 0.0

def eer(labels, scores):                                         # labels: 1 = fake
    fpr, tpr, thr = roc_curve(labels, scores); fnr = 1 - tpr
    i = np.nanargmin(np.abs(fnr - fpr)); return (fpr[i] + fnr[i]) / 2, thr[i]
# read eval/clips/labels/role1.csv, score every clip, write eval/audio/results.csv (clip_id,label,score_fake,confidence), print EER
```

## C5. Golden vectors for feature parity (only if the model uses log-mel, LFCC, etc.)
```python
import numpy as np, soundfile as sf, json
wav, sr = sf.read("eval/clips/wav/golden4s.wav"); assert sr == 16000
feats = my_training_feature_fn(wav.astype(np.float32))            # exactly your training-time function
wav.astype(np.float32).tofile("packages/audio-detector/tests/golden/input.f32")
feats.astype(np.float32).tofile("packages/audio-detector/tests/golden/features.f32")
json.dump({"shape": list(feats.shape), "params": {"n_fft": 512, "hop": 160, "n_mels": 80}}, open("packages/audio-detector/tests/golden/meta.json", "w"))
```

## C6. Browser model loader skeleton (`src/ort.ts`)
```ts
import * as ort from "onnxruntime-web";   // some versions need a different entry for WebGPU; verify in the ORT Web docs

export async function createSession(assetBase: string, preferWebGPU: boolean) {
  ort.env.wasm.wasmPaths = assetBase + "ort/";
  ort.env.wasm.numThreads = 1;
  const url = assetBase + "models/audio/model.onnx";
  const first = preferWebGPU ? ["webgpu", "wasm"] : ["wasm"];
  try {
    return { session: await ort.InferenceSession.create(url, { executionProviders: first }), backend: first[0] };
  } catch (e) {
    if (!preferWebGPU) throw e;
    return { session: await ort.InferenceSession.create(url, { executionProviders: ["wasm"] }), backend: "wasm" };
  }
}
// running one window:
//   const input = new ort.Tensor("float32", windowData, [1, windowData.length]);
//   const out = await session.run({ [meta.inputName]: input });
//   const data = out[meta.outputName].data as Float32Array;
```

## C7. Commands you will run all the time
```bash
pnpm vitest run packages/audio-detector     # unit tests for your package
pnpm verify:parts                                  # everything, before every handover
pnpm harness                                 # then open http://localhost:5173 and press "Run self-test"
```
Handover and integrate commands: master doc sections 18.4 and 18.5.
