# Text model training and evaluation

Training is implemented locally by `eval/text/train_model.py`. It accepts a downloaded English CSV from the Apache-2.0 LLM-generated phishing email corpus and exports the sparse TF-IDF/logistic-regression coefficients to `packages/text-classifier/src/weights.json`. Raw email data is intentionally not stored in this repository.

The training script records a seeded stratified holdout in `eval/text/model-evaluation.json`. For runtime smoke cases, run `node eval/text/run_eval.mjs`; the script bundles and calls the actual TypeScript classifier and writes `eval/text/fixture-results.json`. These hand-authored examples are diagnostic only and are not an independent estimate of real-world performance.
