# Sentinel Latency & Resource Benchmarks

Recorded on macOS (Apple Silicon M-series, Chrome 116+ / Node 22+).

### 1. Per-Stage Latency Budget vs Measured

| Stage | Budget | Measured Median | Notes |
|---|---|---|---|
| JPEG encode (Content Script) | < 10 ms | 3.2 ms | 480 px width, quality 0.7 |
| Frame transport & decode | < 5 ms | 2.1 ms | Base64 decode to `ImageBitmap` |
| Vision landmarks per frame | < 60 ms | 18.4 ms | MediaPipe FaceLandmarker (WASM) |
| Audio model per 4s window | < 300 ms | ~1500 ms (AASIST) | WASM single-thread CPU execution |
| Sync & Arbiter per update | < 20 ms | 1.8 ms | Pearson correlation + state machine |
| End-to-end alert trigger | < 10 s | ~8.2 s | Cumulative dwell and EMA smoothing |

### 2. System Resource Consumption

| Condition | CPU Usage | Memory Delta | Call Quality |
|---|---|---|---|
| Idle Meet / Zoom Call | ~12% | Baseline | Smooth (60 fps UI) |
| Call + Sentinel Active | ~26% | +115 MB | Smooth, zero audio artifacts |

### 3. Key Observations & Trade-Offs

1. **Audio Latency:** AASIST running on single-threaded WASM takes ~1.5s per 4-second hop. The pipeline drops backed-up audio chunks asynchronously so the call and visual detectors remain real-time.
2. **Visual Lip-Sync:** Vision landmarking runs at ~18ms per frame, easily sustaining the 10 fps sampling rate.
3. **Zero Network Egress:** Confirmed via Chrome DevTools Network inspection that zero bytes leave the browser during detection.
