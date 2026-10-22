# Sentinel Model Cards & Detection Engine Specifications

## 1. Audio Anti-Spoofing Model (AASIST)

- **Architecture:** AASIST (Audio Anti-Spoofing using Integrated Spectro-Temporal Graph Attention Networks)
- **Source:** [SpeechAntiSpoofingBenchmarks/AASIST](https://huggingface.co/SpeechAntiSpoofingBenchmarks/AASIST) (ONNX opset 17)
- **License:** MIT
- **Bundle Location:** `packages/audio-detector/assets/model.onnx` (1.62 MB)
- **Input Specification:**
  - Node Name: `wav`
  - Shape: `[1, 64600]` (~4.0375 seconds of mono PCM audio at 16 kHz)
  - Data Type: Float32 in range `[-1.0, 1.0]`
- **Output Specification:**
  - Node Name: `logits`
  - Shape: `[1, 2]` (Index 0: Spoof/Synthetic probability, Index 1: Bonafide natural speech)
- **Runtime Backend:** ONNX Runtime Web (`onnxruntime-web` v1.23.2), executing on WASM single-thread CPU.
- **Latency Benchmark:** ~1500 ms median per 4-second hop on Apple Silicon M-series.
- **Limitations:** Trained primarily on ASVspoof 2019 logical access; generalization to modern zero-shot diffusion voice cloners requires active threshold tuning on real-world codecs.

---

## 2. Facial Landmark & Pose Model (MediaPipe FaceLandmarker)

- **Architecture:** Multi-stage face mesh detector predicting 468 3D facial landmarks and 52 facial blendshapes.
- **Source:** Google MediaPipe Tasks Vision (`face_landmarker.task`)
- **License:** Apache-2.0
- **Bundle Location:** `packages/vision-detector/assets/face_landmarker.task` (3.75 MB)
- **Extracted Metrics:**
  - `mouthAperture`: Normalized vertical inner-lip distance relative to total facial height.
  - `headPose`: 3-axis rotation (Yaw, Pitch, Roll in degrees) computed via Perspective-n-Point (PnP) geometry over canonical facial anchor points.
  - `landmarkQuality`: Confidence score derived from landmark presence score and structural variance.
- **Runtime Backend:** `@mediapipe/tasks-vision` v1.1.1 running on WASM with SIMD acceleration.
- **Latency Benchmark:** 18.4 ms median per frame (comfortably sustains 10 fps real-time processing).

---

## 3. Audio-Visual Lip-Sync Correlation Engine

- **Methodology:** Sliding-window Pearson product-moment correlation coefficient between speech audio energy (RMS of 100 ms audio frames) and inner-lip aperture trajectory:

$$r = \frac{\sum (E_i - \bar{E})(A_i - \bar{A})}{\sqrt{\sum (E_i - \bar{E})^2 \sum (A_i - \bar{A})^2}}$$

- **Lag Search Window:** Sweeps offsets across $[-200\text{ ms}, +200\text{ ms}]$ to compensate for network delivery skew between audio and video tracks.
- **Output:** Score in $[0, 1]$ where $0.0 = \text{natural alignment}$, $1.0 = \text{complete decoupling / artificial dubbing}$.

---

## 4. Text Risk Classifier (Email Protection)

- **Architecture:** Unigram TF-IDF Vectorizer + Logistic Regression Classifier with rule heuristics.
- **Source Dataset:** `Dizzzy0x00/LLMGen-Phishing-Email-Dataset` (Apache-2.0)
- **Bundle Location:** Bundled sparse weights in `packages/text-classifier/src/weights.json` (zero external dependencies).
- **Metrics on Held-Out Test Set:** 99.73% accuracy on synthetic benchmark emails.
