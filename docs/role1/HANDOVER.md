# Role 1 decisions and handover

- **Audio:** replaced the loudness-only model with MIT-licensed AASIST ONNX (`assets/model.onnx`, 1.62 MB). The graph loaded in the browser harness and passed all four audio contract checks. WASM median inference latency was 1,533.6 ms per window, above the original 300 ms target. Upstream domain-shift results are weak on some in-the-wild/newer sets; project-owned labeled clips and calibration are still needed.
- **Text:** replaced rules-only weights with a sparse, offline TF-IDF/logistic-regression model trained on the English CSV from the Apache-2.0 LLM-generated phishing email corpus. Provenance and limitations are recorded in `packages/text-classifier/MODEL_CARD.md`. The raw corpus is not included.
- **Voice clips:** no consented real/fake voice clips were supplied. The labels CSV remains header-only; do not fabricate real-person recordings or labels.

## Audio candidate record

| Candidate | Checkpoint/source | License finding | Browser/export status | Decision |
|---|---|---|---|---|
| AASIST | `SpeechAntiSpoofingBenchmarks/AASIST`, ONNX opset 17 | MIT; license and source card included beside model | Browser WASM loads; 1.534 s median inference per window in harness | Ship as experimental risk signal; optimize and calibrate before demo claims |

## Text measurements

- Synthetic-corpus stratified holdout (seed 17, 2,996 train / 750 test): accuracy 99.73%, phishing precision 99.80%, recall 99.80%, FPR 0.39%, ROC AUC 0.99999. These are random-split metrics on LLM-generated text, not real-world performance.
- Actual TypeScript classifier on 20 authored smoke fixtures: binary accuracy 85%, phishing precision 100%, recall 70%, FPR 0% (TN 10, FP 0, FN 3, TP 7). Suspicious is counted as positive; fixtures are diagnostic only.
- Reproduce the runtime fixture result with `node eval/text/run_eval.mjs`; it writes per-case output to `eval/text/fixture-results.json`.

## Browser integration check

All 20 integration self-test checks passed with Role 1 audio/text active and Role 2 modules mocked. Audio self-test used synthetic waveform and confirms runtime wiring only; it is not anti-spoof accuracy evidence. Text self-test passed its benign and phishing examples after training.

## Remaining human/data dependency

Collect at least 10 real and 10 generated fake clips using only consenting speakers, include P/B phonemes, label them in `eval/clips/labels/role1.csv`, and keep a speaker/tool holdout. Then run `python eval/audio/run_eval.py`, calibrate a threshold on a separate calibration split, and measure browser latency on the demo machine.
