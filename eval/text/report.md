# Text evaluation report

The local TF-IDF/logistic-regression model was trained on the English partition of the Apache-2.0 `Dizzzy0x00/LLMGen-Phishing-Email-Dataset`. The dataset card describes both legitimate and phishing messages as LLM-generated. Training used a stratified random 80/20 split (`random_state=17`): 2,996 train and 750 test examples.

| Metric on held-out split | Result |
|---|---:|
| Accuracy | 99.73% |
| Phishing precision | 99.80% |
| Phishing recall | 99.80% |
| False-positive rate | 0.39% |
| ROC AUC | 0.99999 |
| Confusion matrix (TN, FP, FN, TP) | 253, 1, 1, 495 |

The very high random-split results are likely dataset-specific and do not establish real-world performance. A random split may also place related generated examples on both sides. Before using this for consequential filtering, evaluate on real, independently sourced, privacy-cleared mail and a separate campaign/time holdout. Raw email text is not part of the repository.

The bundled TypeScript classifier also ran on 20 hand-authored smoke fixtures: binary accuracy 85%, phishing precision 100%, recall 70%, and FPR 0% (TN 10, FP 0, FN 3, TP 7; `suspicious` counts as positive). This small fixture set is diagnostic only and should not be read as a generalization estimate. Run `node eval/text/run_eval.mjs` to regenerate the per-case results.

Reproduce with `python eval/text/train_model.py path/to/GPT_Phishing_Email_dataset.csv`. The script updates `packages/text-classifier/src/weights.json` and `eval/text/model-evaluation.json`.
