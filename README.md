# Sentinel — Omni-Channel Anti-Scam Prototype

Sentinel is a research prototype for privacy-conscious scam and synthetic-media risk signals in browser meetings. It combines an AASIST audio anti-spoofing model, MediaPipe face landmarks, an experimental pretrained frame-level synthetic-image classifier, audio-to-mouth-motion correlation, scripted liveness checks, and a rule-based arbiter in a Chrome extension and offline browser harness.

**Project status:** this prototype includes build, type, integration, privacy, and unit-check commands. Live-call behavior and detector accuracy have not been validated on a labeled, consented dataset. Do not treat `CLEAR` as proof that a caller is genuine; `NO DATA` means the extension has no fresh evidence to assess.

## What is implemented

- Chrome Manifest V3 extension with Meet and Zoom Web content scripts, an offscreen capture/inference page, popup controls, and an in-page overlay.
- Pretrained AASIST inference through ONNX Runtime Web, MediaPipe face/hand landmarks, and an experimental frame-level synthetic-image classifier. The extension prefers WebGPU when available and falls back to CPU/WASM. Model and runtime assets are copied into the extension bundle at build time.
- Audio/visual signal fusion, a state machine, interactive challenge checks, and a phishing-text classifier package.
- Gmail content script that locally checks opened messages and displays a risk banner. Gmail selectors are site-dependent and need confirmation in the target account.
- Offline self-test and media replay harness under `apps/harness`, including a simulated preview of the production in-call alert overlay.
- Privacy guardrails: source scan plus same-origin connection policy for extension pages and harness pages.

The Gmail content script extracts the open message in the page and runs the bundled classifier locally; Gmail selectors can change and should be verified in the target account. The frame classifier scores individual face crops, not whole videos, and has not been evaluated or calibrated on this project's live-call data. It is an experimental risk signal, not proof of a deepfake. Challenges check simple movements and do not verify identity. The audio model is slow on CPU and has known domain-shift limitations. The bundled frame model is about 87 MB (83 MiB); include it when copying or submitting the project.

## Requirements

- Node.js 20.11 or newer
- pnpm 10 or newer
- Chrome 116 or newer for the extension

## Install, verify, and build

```sh
pnpm install --frozen-lockfile
pnpm verify
pnpm build
```

`pnpm verify` runs integration and privacy checks, TypeScript type checking, unit tests, and an extension build. The build output is `apps/extension/dist/`. Load that directory from `chrome://extensions` with Developer mode enabled; Chrome requires Developer mode to remain on for an unpacked extension. The normal build uses real detectors; scripted mock controls are available only in development/watch builds.

Run the offline harness with:

```sh
pnpm harness
```

Open `http://localhost:5173`, run the self-test, preview the simulated alert, or choose **Open replay harness** to load local media. The notification preview uses the production overlay component but feeds it sample results. Harness self-tests validate module contracts and wiring; they do not measure real-world detection accuracy.

## Evaluation and evidence

- The text model's reported 99.73% accuracy is from a random holdout within an LLM-generated English email corpus. It is not a real-world performance estimate. A 20-message hand-authored smoke set yielded 85% binary accuracy (with `suspicious` counted as positive).
- No project-owned, labeled real/fake voice or video clips are included. Audio/vision accuracy, sync thresholds, challenge success rates, and live-call latency therefore remain unmeasured for this project.
- See [evaluation reports](eval/), [model cards](packages/), [architecture](docs/ARCHITECTURE.md), [the demo guide](docs/demo-script.md), and the [security and bypass review](docs/security-review.md) for methods, limitations, and next steps.

## Privacy and permissions

The design processes captured call media locally. The extension and harness CSP restrict connection destinations to their own origin, including for SDK-initiated metric requests. The build-time privacy script scans project source code; it does not inspect bundled third-party dependencies, so the CSP is an additional runtime control. Browser Network-panel verification remains a recommended submission check. The extension requests tab capture and access to supported meeting pages; explain these permissions before asking anyone to install it.

## Repository map

- `apps/extension/` — Chrome extension source and manifest
- `apps/harness/` — offline self-test and media replay UI
- `packages/` — contracts, detectors, fusion, and pipeline
- `eval/` — evaluation scripts, fixtures, and reports
- `colab/` — model exploration/export notebooks
- `docs/` — architecture, model notes, limitations, and demo guide

## Team contributions

| Area | Owner | Main paths |
|---|---|---|
| Audio and text | Utkarsh | `packages/audio-detector`, `packages/text-classifier`, `colab/audio`, `colab/text`, `eval/audio`, `eval/text` |
| Vision and synchronization | Yash | `packages/vision-detector`, `packages/sync-detector`, `packages/challenge-verifier`, `colab/vision`, `eval/vision` |
| Integration | Aditya | `apps/`, `packages/contracts`, `packages/arbiter`, `packages/pipeline`, `packages/mocks`, scripts, and root configuration |

## License

The project code is MIT licensed. Individual model and dependency terms are documented in their respective model cards and asset folders; verify model redistribution terms before publishing a redistributed build.
