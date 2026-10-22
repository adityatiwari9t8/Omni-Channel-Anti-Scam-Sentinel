"""Train/export the offline TypeScript TF-IDF logistic-regression model.

Usage: python eval/text/train_model.py path/to/GPT_Phishing_Email_dataset.csv
The source file is intentionally not bundled. See MODEL_CARD.md for provenance.
"""
import csv
import json
import sys
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, roc_auc_score
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[2]
WEIGHTS = ROOT / "packages/text-classifier/src/weights.json"
REPORT = ROOT / "eval/text/model-evaluation.json"
TOKEN_PATTERN = r"(?u)[a-z0-9]+(?:['’-][a-z0-9]+)*"

def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: python eval/text/train_model.py path/to/English_phishing_emails.csv")
    source = Path(sys.argv[1])
    texts, labels = [], []
    with source.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            text, label = row.get("content", "").strip(), row.get("label", "").strip()
            if text and label in {"0", "1"}:
                texts.append(text)
                labels.append(int(label))
    if len(set(labels)) != 2 or len(texts) < 100:
        raise SystemExit(f"expected at least 100 English rows with both binary labels; got {len(texts)}")

    train_x, test_x, train_y, test_y = train_test_split(
        texts, labels, test_size=0.2, random_state=17, stratify=labels
    )
    vectorizer = TfidfVectorizer(
        lowercase=True, token_pattern=TOKEN_PATTERN, min_df=2, max_features=12000,
        sublinear_tf=False, norm="l2", dtype=np.float64,
    )
    x_train = vectorizer.fit_transform(train_x)
    x_test = vectorizer.transform(test_x)
    classifier = LogisticRegression(C=2.0, max_iter=1000, random_state=17)
    classifier.fit(x_train, train_y)
    predictions = classifier.predict(x_test)
    probabilities = classifier.predict_proba(x_test)[:, 1]

    vocabulary = vectorizer.vocabulary_
    idf = vectorizer.idf_
    coefficients = classifier.coef_[0]
    model = {
        "trained": True,
        "intercept": float(classifier.intercept_[0]),
        "vocabulary": {token: float(idf[index]) for token, index in vocabulary.items()},
        "weights": {token: float(coefficients[index]) for token, index in vocabulary.items()},
    }
    WEIGHTS.write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    tn, fp, fn, tp = confusion_matrix(test_y, predictions, labels=[0, 1]).ravel()
    report = {
        "source_file": source.name,
        "source_url": "https://huggingface.co/datasets/Dizzzy0x00/LLMGen-Phishing-Email-Dataset",
        "source_license": "Apache-2.0",
        "source_data_note": "LLM-generated English email corpus; results do not establish real-world performance.",
        "seed": 17,
        "train_size": len(train_y), "test_size": len(test_y),
        "class_counts_all": {"legitimate": labels.count(0), "phishing": labels.count(1)},
        "accuracy": float(accuracy_score(test_y, predictions)),
        "precision_phishing": float(tp / max(1, tp + fp)),
        "recall_phishing": float(tp / max(1, tp + fn)),
        "false_positive_rate": float(fp / max(1, fp + tn)),
        "roc_auc": float(roc_auc_score(test_y, probabilities)),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "sklearn_report": classification_report(test_y, predictions, target_names=["legitimate", "phishing"], output_dict=True),
        "vocabulary_size": len(vocabulary),
        "threshold": 0.5,
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in (
        "train_size", "test_size", "accuracy", "precision_phishing", "recall_phishing",
        "false_positive_rate", "roc_auc", "confusion_matrix", "vocabulary_size"
    )}, indent=2))
    print(f"Exported {WEIGHTS.relative_to(ROOT)} and {REPORT.relative_to(ROOT)}")

if __name__ == "__main__":
    main()
