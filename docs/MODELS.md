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
- **Runtime Backend:** ONNX Runtime Web (`onnxruntime-web` v1.23.2). The extension requests WebGPU and falls back to single-thread WASM; the browser harness defaults to WASM.
- **Latency Evidence:** The audio model card records about 1.53 s median inference per 4-second window in its synthetic browser-harness run. This is a runtime measurement, not a live-call benchmark.
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
- **Runtime Backend:** `@mediapipe/tasks-vision` v1.1.1; the extension requests GPU and falls back to CPU. The backend used in a live browser demo has not been recorded.

## Experimental frame-level synthetic-image classifier

- **Model:** CommunityForensics-DeepfakeDet-ViT ONNX, revision `0b8f9cb` of [`buildborderless/CommunityForensics-DeepfakeDet-ViT`](https://huggingface.co/buildborderless/CommunityForensics-DeepfakeDet-ViT).
- **License:** MIT, per the model repository. The model is bundled locally at `packages/vision-detector/assets/deepfake/community-forensics-vit.onnx` (87,442,080 bytes; about 83.4 MiB; SHA-256 `a42c7d740fbb345ba9a26d469b22f301d73089ce3c6da993877ed2b6965a8ba1`). Include this asset in project submissions/builds.
- **Purpose and limits:** Produces a synthetic-image risk score for a face crop from a single video frame. The model card reports training on 2.7 million examples from 4,803 generators. It is used as an experimental per-frame signal; this project has not evaluated or calibrated it on held-out live video, so its score is not a probability of fraud or proof of a deepfake.
- **Preprocessing/output:** Face crop resized to 440 pixels then center-cropped to 384×384, RGB normalized with CLIP mean/std; a single logit is converted with sigmoid to `[0,1]` and fused as visual evidence. The detector samples at most once every two seconds and reuses the latest score for up to four seconds.
- **Runtime:** ONNX Runtime Web 1.23.2, WebGPU preferred with WASM fallback. The 87 MB FP32 model can increase package size, memory use, and startup time; CPU inference is suitable for demonstrations but may be slow on lower-powered devices.

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
