# Audio Module Model Cards

## 1. Audio Detective Model: AASIST

- **Model name and version:** AASIST (Audio Anti-Spoofing using Integrated Spectro-Temporal Graph Attention Networks) v1.0 ONNX
- **Source URL:** https://huggingface.co/SpeechAntiSpoofingBenchmarks/AASIST
- **License:** MIT (per AASIST-LICENSE.txt in `packages/audio-detector/assets/`)
- **Files in assets:** `model.onnx` (1.62 MB), `meta.json`
- **Input spec:** Name: `wav`, shape: `[1, 64600]`, dtype: float32, sample rate: 16000 Hz, raw waveform, no normalization.
- **Output spec:** Name: `logits`, shape: `[1, 2]`, kind: `logits2`, index 0 = spoof/fake, index 1 = bonafide.
- **Backend:** ONNX Runtime Web (WASM with fallback to CPU).
- **Latency:** ~1.5 s median inference per 4-second audio window on browser WASM.
- **Known limitations:** Trained on ASVspoof 2019 LA; sensitivity to modern diffusion-based voice clones and noisy real-call codecs requires domain calibration.
- **Current project proxy:** 2,416 scored utterances from three ASVspoof 2021 LA eval shards (353 bona fide / 2,063 spoof); 62 speech-gate abstentions among 2,478 window-eligible files. At the unchanged interface threshold 0.5: balanced accuracy 89.8%, spoof recall 94.6%, bona fide FPR 15.0%, FNR 5.4%, ROC AUC 0.963, and PR average precision 0.992. No threshold was chosen on this evaluation subset. See `eval/audio/report.md` for coverage, confusion matrix, and limitations.
- **Training status:** no training or fine-tuning was performed; the available 2021 LA rows are evaluation-only and the project label file is empty.

---

## 2. Text Classifier Model: Phishing Risk Detector

- **Model name and version:** TF-IDF unigram logistic regression + rule heuristics v0.2.0
- **Training source:** `Dizzzy0x00/LLMGen-Phishing-Email-Dataset` (Apache-2.0)
- **Files in assets/src:** `src/weights.json` bundled directly into code
- **Input spec:** Email subject, body text, links, sender name and address.
- **Output spec:** Risk score in [0, 1], label ("safe" | "suspicious" | "phishing"), reasons list.
- **Metrics on held-out synthetic corpus:** Accuracy 99.73%, Precision 99.80%, Recall 99.80%, FPR 0.39%.
- **Known limitations:** English only; trained on synthetic LLM-generated corpus; intended as an on-device rule-assisted prototype.
