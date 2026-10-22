"""Summarize exported Vision Module detector results against the Vision Module clip labels."""
import csv
import sys
from collections import defaultdict
from pathlib import Path


def load(path):
    with Path(path).open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def rate(rows, pred):
    return sum(pred(r) for r in rows) / len(rows) if rows else float("nan")


def main(labels_path, results_path):
    labels = {r["clip_id"]: r for r in load(labels_path)}
    results = {r["clip_id"]: r for r in load(results_path)}
    rows = [(labels[k], results[k]) for k in labels.keys() & results.keys()]
    if not rows:
        raise SystemExit("No matching clip_id rows. Add labels and detector exports first.")
    real = [result for label, result in rows if label["label"].strip().lower() == "real"]
    fake = [result for label, result in rows if label["label"].strip().lower() == "fake"]
    def number(row, key):
        try: return float(row[key])
        except (KeyError, TypeError, ValueError): return float("nan")
    # The initial operational threshold is scoreFake >= 0.5; recalibrate before claiming metrics.
    fpr = rate(real, lambda r: number(r, "sync_score") >= 0.5)
    tpr = rate(fake, lambda r: number(r, "sync_score") >= 0.5)
    print(f"Matched clips: {len(rows)} (real={len(real)}, fake={len(fake)})")
    print(f"Sync detection rate at provisional scoreFake >= 0.5: {tpr:.3f}")
    print(f"Sync false positive rate at provisional scoreFake >= 0.5: {fpr:.3f}")
    groups = defaultdict(list)
    for label, result in rows: groups[result.get("challenge", "unknown")].append((label, result))
    for challenge, items in sorted(groups.items()):
        real_items = [r for l, r in items if l["label"].lower() == "real"]
        fake_items = [r for l, r in items if l["label"].lower() == "fake"]
        fail = lambda r: r.get("challenge_state", "").lower() == "failed" or number(r, "artifact_score") >= 0.5
        print(f"{challenge}: real pass rate={1-rate(real_items, fail):.3f}; fake fail/high-artifact rate={rate(fake_items, fail):.3f}")
    print("These rates use only matched, supplied clips and a provisional threshold; keep holdout clips separate.")


if __name__ == "__main__":
    if len(sys.argv) != 3: raise SystemExit("Usage: python eval/vision/run_eval.py LABELS.csv RESULTS.csv")
    main(sys.argv[1], sys.argv[2])
