# Vision Module model card

Model name and version: MediaPipe Face Landmarker float16 task bundle v1; MediaPipe Hand Landmarker float16 task bundle v1.
Source URL and commit/checkpoint: [Face Landmarker bundle](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task); [Hand Landmarker bundle](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task). Both URLs are the versions specified by the project brief; no source commit metadata was supplied.
Licence (and whether we may redistribute it inside a public extension: yes/no/unclear): `@mediapipe/tasks-vision` 1.1.1 is listed as Apache-2.0 by npm. The model bundles' independent redistribution terms have not been confirmed from a model-specific licence; treat redistribution as unclear until checked.
Privacy note: the SDK's official privacy notice says task inputs are processed on-device but performance and utilization metrics are sent to Google. The pinned Web bundle contains a sender for `https://odml.pa.googleapis.com/v1/log`; see the handover for the required CSP and Network-panel check before claiming zero egress.
Files in assets/ (name, size, sha256): see current file inventory below (generated after download).
Input spec (names, shapes, dtype, sample rate or image size, normalization): `ImageBitmap`, RGB image, up to 480 px wide; MediaPipe normalizes internally. Face detector requests at most two faces. Hand detector requests at most two hands.
Output spec (names, shapes, meaning, which index or sign means “fake”): 478-point face landmarks and facial transformation matrix; hand landmarks. Derived fields are mouth aperture (landmarks 13/14 over 10/152 face height), yaw/pitch/roll, hand proximity/box coverage, and stability. These are signals, not a trained fake classifier.
Feature extraction (exact recipe and parameters, or “inside the graph”): largest face box; aspect-correct pixel distances; mouth gap divided by top-to-chin distance; 8-point motion stability relative to face center; hand-box union overlap. Pose uses the MediaPipe transform matrix with landmark geometry fallback.
Backend used (webgpu/wasm), precision (fp32/int8/fp16): runtime requests GPU when `preferGPU` is enabled and falls back to CPU if GPU initialization fails. The backend used on the demo laptop was not recorded because the real-model browser run was not completed. The downloaded model assets are float16 variants; this does not establish the runtime arithmetic precision.
Latency (median and p95, ms) on the demo laptop, per window or per frame: no measurements collected. The real-model browser run and a consenting face image are required to measure this.
Accuracy on our clips (counts, accuracy, EER or detection rate, false positive rate): no clips were supplied, so the evaluation set contains zero labeled examples and no metrics are reported.
Recommended thresholds and why: sync thresholds are initial defaults (`speechRms=0.01`, `rLow=0.1`, `rHigh=0.5`, 8-second window, ±400 ms lag search) from `packages/sync-detector/src/calibration.json`; they are not calibrated. No challenge artifact threshold is recommended because no real/fake sessions were evaluated.
Known failure cases: blur, occlusion, unusual lighting, large pose, face swaps that preserve landmarks, hand-box approximation, and mixed-speaker group-call audio.
Alternatives tried and why rejected: none measured. Hand Landmarker is enabled so cover and raise-fingers signals are available.

Asset inventory:

| File | Bytes | SHA-256 |
|---|---:|---|
| `face_landmarker.task` | 3,758,596 | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |
| `hand_landmarker.task` | 7,819,105 | `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` |
| `selftest/face.jpg` | 413,252 | `2465de71c15e5bb26e1d78cf88a483e6860ed3c6e17bb111c72fc8c221da88c7` |

`selftest/face.jpg` is a synthetically generated fictional portrait used only to smoke-test face landmarks and the frame-classifier inference path. Its score is not a detector accuracy result. It does not replace consented real-call validation, and no labeled real/fake clip data is included.

## Experimental frame-level synthetic-image classifier

- **Model/source:** CommunityForensics-DeepfakeDet-ViT ONNX from [`buildborderless/CommunityForensics-DeepfakeDet-ViT`](https://huggingface.co/buildborderless/CommunityForensics-DeepfakeDet-ViT), source revision `0b8f9cb` (the revision pinned in `docs/MODELS.md`). This is an image classifier, not a temporal video model.
- **License:** MIT as stated by the model repository. The source card describes the checkpoint as a Community Forensics image detector; it does not provide a complete per-example license inventory for the underlying 2.7 million training samples. This project did not train on or redistribute those source images.
- **Runtime asset:** `assets/deepfake/community-forensics-vit.onnx`, 87,442,080 bytes; expected SHA-256 `a42c7d740fbb345ba9a26d469b22f301d73089ce3c6da993877ed2b6965a8ba1` (verify before release).
- **Input:** face box from MediaPipe landmarks; square crop expanded to 1.3× the larger face-box dimension and bounded by the frame; browser canvas resize to 440×440; 384×384 center crop. `ImageData` RGBA is converted to RGB, normalized channel-wise with mean `[0.4815, 0.4578, 0.4082]` and standard deviation `[0.2686, 0.2613, 0.2758]`, then packed as float32 NCHW `[1, 3, 384, 384]`. ONNX Runtime binds the first input name returned by the graph.
- **Output:** the adapter reads the first value from the first ONNX output (single synthetic-class logit per the source model config) and applies sigmoid to produce `deepfakeScore` in `[0,1]`. Higher values are treated as stronger synthetic-image signal. The current adapter assigns fixed confidence `0.4`; the downstream 0.5 reason cutoff is not calibrated.
- **Evaluation/training:** no project-owned labeled images or videos are present; `eval/clips/labels/vision-eval.csv` is header-only. No frame-level or video-level accuracy, calibration, compression robustness, or live-call result is claimed. No fine-tuning was performed.
- **Limitations:** a single frame cannot establish temporal manipulation, synthetic-image detection does not equal face-swap or live-video detection, frame samples from one video are correlated, and this project has not measured performance on its target population. The synthetic self-test portrait is excluded from evaluation and training.
- **Reproduction:** browser ONNX smoke path is exercised by the existing harness self-test. For a labeled per-frame export, `python eval/vision/evaluate_frame_scores.py PATH_TO_SCORES.csv --dataset NAME --revision REVISION --license LICENSE` checks video/person/source split separation, selects a video-level threshold on validation only, then reports frame- and video-level test metrics using a predeclared max-score aggregation. No such score export is currently available.
