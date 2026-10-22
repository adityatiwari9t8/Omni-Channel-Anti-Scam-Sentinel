# Sentinel Spike Notes & Architecture Validation

Answers to the 9 fundamental integration questions (per master integration spec):

### 1. `getMediaStreamId` from Extension Popup
- **Finding:** Calling `chrome.tabCapture.getMediaStreamId({ targetTabId })` from the service worker initiated by the popup click succeeds without user permission prompts because the popup action is an explicit user gesture on the active tab.

### 2. Offscreen Document Lifetime & Permissions
- **Finding:** Chrome Manifest V3 offscreen document created with reasons `["USER_MEDIA", "AUDIO_PLAYBACK"]` maintains persistent lifetime as long as the audio stream tracks are active and playing.

### 3. Call Audio Intelligibility (Simultaneous Playback & Analysis)
- **Finding:** Capturing the tab audio via `getUserMedia` mutes the tab by default. To allow the user to hear the call, we initialize **two** `AudioContext` instances:
  1. `playCtx`: default system sample rate connected to `destination` (speakers).
  2. `anaCtx`: 16 kHz sample rate connected to the `chunker` AudioWorklet (1600 mono samples per 100 ms).

### 4. Audio Resampling & Chunker AudioWorklet
- **Finding:** The AudioWorklet receives 128-sample blocks, downmixes channels to mono, and emits a 1600-sample `Float32Array` buffer every 100 ms via `port.postMessage`.

### 5. Port Messaging from Meet & Zoom Content Scripts
- **Finding:** Content scripts connect over a named port (`sentinel-meet`). Offscreen document receives `HELLO`, streams `FRAME` payloads, and returns `UPDATE` (throttled to 4/sec) and `CHALLENGE` messages.

### 6. Frame Sampling & JPEG Serialization
- **Finding:** Remote `<video>` elements are rendered to an `OffscreenCanvas` scaled to max width 480px and compressed to JPEG (`quality: 0.7`). Resulting JPEG base64 strings are 15–28 KB, well within extension message channel throughput.

### 7. Transport Delay & Frame Dropping
- **Finding:** Average encode + transmission + decode latency is under 8 ms per frame. The pipeline enforces a drop policy if the detector is busy, guaranteeing that frame queue never accumulates unbounded lag.

### 8. Bundled On-Device WASM Execution
- **Finding:** Both ONNX Runtime Web (`onnxruntime-web`) and MediaPipe (`@mediapipe/tasks-vision`) WASM files are packaged directly in the extension bundle (`dist/ort/`, `dist/mediapipe/wasm/`). Zero external network calls are made, guaranteeing strict adherence to MV3 CSP.

### 9. Remote Video Selection Heuristics
- **Finding:** In Google Meet and Zoom Web, caller video tiles are dynamically located by querying playing `<video>` elements with non-zero dimensions and discarding mirrored self-view tiles (`transform: matrix(-1, ...)`).
