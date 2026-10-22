# Performance and Evaluation Evidence

This document separates reproducible project evaluation from informal performance notes. Do not present unverified notes as measured project results.

## Reproducible evaluation currently available

The AASIST audio detector has a benchmark-proxy result on 2,416 scored utterances selected from three ASVspoof 2021 LA evaluation shards (353 bona fide, 2,063 spoof). At the shipped, uncalibrated 0.5 threshold it reports 89.8% balanced accuracy, 94.6% spoof recall, 15.0% bona fide false-positive rate, 5.4% false-negative rate, ROC AUC 0.963, and stepwise PR average precision 0.992. There were 62 speech-gate abstentions among 2,478 window-eligible files; short files are also excluded. These are benchmark-only conditional metrics, not call accuracy. Recompute the saved-score summary with `python eval/audio/summarize_asvspoof_proxy.py`; rerunning inference needs the Parquet shards described in `eval/audio/report.md`.

The text classifier was evaluated on a random stratified holdout from an LLM-generated English phishing email corpus (seed 17; 2,996 training and 750 test examples). Results: 99.73% accuracy, 99.80% phishing precision and recall, 0.39% false-positive rate, and ROC AUC 0.99999. Related generated examples may occur across the random split, so these metrics do not establish generalization to real email. The bundled TypeScript classifier scored 85% binary accuracy on 20 authored diagnostic fixtures (10 TN, 0 FP, 3 FN, 7 TP; `suspicious` counted as positive).

Reproduce the fixture evaluation with `node eval/text/run_eval.mjs`. The corpus training/evaluation script is documented in `eval/text/report.md`.

## Not yet measured on project data

- Project-owned audio/video accuracy, calibrated thresholds, and live-call false-positive rates: no labeled project call clips are present. Video deepfake classification has no labeled frame-score export and therefore no frame-level or video-level metrics.
- Vision and audio/visual synchronization thresholds and liveness challenge rates: no labeled sessions are present.
- Extension end-to-end latency, CPU, memory, and call quality: no repeatable live-browser measurement log is included.
- Network egress behavior: source checks pass and CSP restricts destinations to the local origin; perform a Chrome DevTools Network-panel check on the final build before presenting this as observed browser evidence.

Earlier drafts recorded estimates such as 18.4 ms per vision frame, 1.5 s per AASIST window, and 8.2 s to alert. Their raw traces and repeatable measurement procedure are absent, so treat them as informal development notes, not validated benchmarks. See `eval/audio/report.md` and `eval/vision/report.md` for data requirements and limitations.
