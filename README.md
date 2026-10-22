# Sentinel: Omni-Channel Anti-Scam Shield

An entirely on-device Chrome extension that inspects live video calls (**Google Meet** and **Zoom Web**) and protects users from deepfake audio, face-swap video clones, and social engineering fraud.

All inference runs inside the browser sandbox using **ONNX Runtime Web (WASM)** and **MediaPipe**. No audio, video, or sensitive data ever leaves your computer.

---

## 🚀 Key Features

- **Multi-Modal Deepfake Detection**:
  - **Audio Anti-Spoofing**: Inspects speech frequency characteristics using AASIST neural graphs running on ONNX Runtime Web.
  - **Facial Landmark & Pose Tracking**: Extracts 468+ 3D facial landmarks and head pose using MediaPipe Vision.
  - **Audio-Visual Lip-Sync Correlation**: Computes Pearson correlation between speech audio energy (RMS) and inner-lip aperture over a sliding window.
- **Dynamic Arbiter & State Machine**:
  - Multi-sensor fusion engine with exponential moving average (EMA) smoothing and hysteresis prevention.
  - 4 distinct operational states: `CLEAR` (Nominal), `SUSPICIOUS` (Elevated risk), `CHALLENGE` (Interactive caller verification), and `ALERT` (Critical deepfake detection).
- **Interactive Liveness Challenges**:
  - Prompts the user to request unexpected movements from the caller (e.g. head yaw sweeps, face occlusions) that break real-time generative models.
- **Non-Intrusive In-Page Overlay**:
  - Injected via isolated **Shadow DOM** into Google Meet and Zoom tabs. Displays traffic-light status, plain-language reasoning, and countdown timers without obstructing meeting controls.
- **100% Privacy Preserving**:
  - Zero server telemetry, zero third-party API dependencies, zero remote network egress. Enforced by automated build-time static checks.

---

## 👥 Architecture & Team Roles

The Sentinel system is partitioned into three cleanly separated roles unified through shared contracts (`@sentinel/contracts`):

| Role | Contributor | Focus Areas & Packages |
|---|---|---|
| **Audio Module** | **Utkarsh** | Audio deepfake detection (`packages/audio-detector`), phishing text classifier (`packages/text-classifier`), model cards, training notebooks. |
| **Vision Module** | **Yash** | Facial computer vision (`packages/vision-detector`), audio-visual sync (`packages/sync-detector`), interactive challenge verifier (`packages/challenge-verifier`). |
| **Full-Stack Integration** | **Aditya** | Full-stack extension architecture (`apps/extension`), multi-signal arbiter (`packages/arbiter`), capture pipeline (`packages/pipeline`), offline harness (`apps/harness`), root configs & integration. |

---

## 🛠️ Quick Start & Installation

### Prerequisites
- **Node.js**: v20.11 or newer (tested on Node v26.11)
- **pnpm**: v10+ (tested on pnpm v12.6)
- **Google Chrome**: v116 or newer

### Setup & Build

```bash
# 1. Clone repository
git clone https://github.com/adityatiwari9t8/sentinal.git
cd sentinal

# 2. Install workspace dependencies
pnpm install

# 3. Run verification test suite (unit tests, integration checks, privacy validation)
pnpm verify

# 4. Build extension bundle
pnpm build
```

The compiled Chrome extension is produced in: `apps/extension/dist`.

---

## 📦 Loading the Extension into Chrome

1. Open Chrome and navigate to `chrome://extensions`.
2. Toggle on **"Developer mode"** in the top-right corner.
3. Click **"Load unpacked"**.
4. Select the `apps/extension/dist` folder in this repository.
5. Open [Google Meet](https://meet.google.com) or [Zoom Web](https://app.zoom.us).
6. Click the Sentinel toolbar icon and press **"Start Monitoring"**.

---

## 🧪 Local Offline Replay & Self-Test Harness

You can test and tune Sentinel completely offline without starting an active meeting:

```bash
# Start local test harness server
pnpm harness
```
Then open [http://localhost:5173](http://localhost:5173):
- **Self-Test (`/index.html`)**: Runs all 5 detector modules against synthetic and benchmark fixtures to verify contract compliance and inference latencies.
- **Replay Harness (`/replay.html`)**: Allows loading any `.mp4` or `.wav` file, adjusting live fusion weights, observing score trajectories, and downloading JSONL decision logs.

---

## 📊 Measured Performance & Limitations

- **Vision Latency**: ~18 ms per frame on browser WASM (supports steady 10 fps sampling).
- **Audio Inference**: ~1.5 s per 4-second hop with AASIST ONNX. Handled asynchronously via a non-blocking drop-queue in the pipeline.
- **Transport Overhead**: Remote video canvas encoding (JPEG quality 0.7) and base64 transfer to the offscreen worker completes in < 4 ms.
- **Current Limitations**: Lip-sync correlation requires sustained speech (~3 seconds) to establish statistical confidence. Brief consonant closures (e.g. "P" / "B") are below word-level resolution at 10 fps.

---

## 📄 License

MIT License. See individual package asset folders for upstream model licenses (AASIST: MIT, MediaPipe: Apache-2.0).
