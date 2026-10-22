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
