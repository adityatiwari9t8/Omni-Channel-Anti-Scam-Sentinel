"""Score labeled 16 kHz mono clips with the bundled ONNX model and report clip metrics."""
import csv
import json
from pathlib import Path

import numpy as np
import soundfile as sf
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[2]
ASSET = ROOT / "packages/audio-detector/assets"
LABELS = ROOT / "eval/clips/labels/role1.csv"
OUT = ROOT / "eval/audio/results.csv"
REPORT = ROOT / "eval/audio/metrics.json"

def convert(output, meta):
    values = np.asarray(output).reshape(-1)
    kind = meta["outputKind"]
    if kind == "logits2":
        shifted = values[:2] - values[:2].max()
        probs = np.exp(shifted) / np.exp(shifted).sum()
        return float(probs[meta["fakeIndex"]])
    if kind == "logit1":
        x = float(values[0])
        return 1 / (1 + np.exp(-x))
    if kind == "score1_bonafide":
        return float(np.clip(1 - values[0], 0, 1))
    return float(np.clip(values[0], 0, 1))

def score_clip(wav, session, meta):
    window, hop = meta["windowSamples"], meta["hopSamples"]
    scores, confidence = [], []
    if len(wav) < window:
        return 0.0, 0.0
    for start in range(0, len(wav) - window + 1, hop):
        sample = wav[start:start + window].astype(np.float32)
        frames = [sample[i:i + 320] for i in range(0, len(sample), 320)]
        ratio = sum(float(np.sqrt(np.mean(f * f))) > meta["silenceRmsThreshold"] for f in frames) / len(frames)
        if ratio < 0.3:
            continue
        output = session.run([meta["outputName"]], {meta["inputName"]: sample[None, :]})[0]
        score = convert(output, meta)
        margin = min(1.0, abs(score - meta["thresholdFake"]) / 0.25)
        scores.append(score)
        confidence.append(min(1.0, ratio / 0.6) * margin)
    return (float(np.mean(scores)), float(np.mean(confidence))) if scores else (0.0, 0.0)

def main():
    meta = json.loads((ASSET / "meta.json").read_text(encoding="utf-8"))
    session = ort.InferenceSession(str(ASSET / "model.onnx"), providers=["CPUExecutionProvider"])
    rows = []
    with LABELS.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if not row.get("file") or not row.get("label"):
                continue
            if row["label"].lower() not in {"real", "fake"}:
                raise ValueError(f"{row.get('clip_id')}: label must be 'real' or 'fake'")
            path = ROOT / row["file"]
            audio, rate = sf.read(path, dtype="float32", always_2d=False)
            if audio.ndim == 2:
                audio = audio.mean(axis=1)
            if rate != 16000:
                raise ValueError(f"{path}: expected 16 kHz PCM, got {rate}; resample before evaluation")
            score, confidence = score_clip(audio, session, meta)
            rows.append({"clip_id": row.get("clip_id", ""), "label": row["label"], "score_fake": score, "confidence": confidence})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["clip_id", "label", "score_fake", "confidence"])
        writer.writeheader(); writer.writerows(rows)
    if rows:
        labels = [row["label"].lower() == "fake" for row in rows]
        scores = [row["score_fake"] for row in rows]
        fake_count, real_count = sum(labels), len(labels) - sum(labels)
        candidates = sorted({0.0, 1.0, *scores})
        operating = []
        for threshold in candidates:
            fp = sum(not label and score >= threshold for label, score in zip(labels, scores))
            fn = sum(label and score < threshold for label, score in zip(labels, scores))
            far, frr = fp / max(1, real_count), fn / max(1, fake_count)
            operating.append({"threshold": threshold, "false_accept_rate": far, "false_reject_rate": frr})
        eer_point = min(operating, key=lambda point: abs(point["false_accept_rate"] - point["false_reject_rate"]))
        threshold = meta["thresholdFake"]
        tp = sum(label and score >= threshold for label, score in zip(labels, scores))
        fp = sum(not label and score >= threshold for label, score in zip(labels, scores))
        fn = fake_count - tp
        tn = real_count - fp
        report = {
            "model_id": meta["id"], "clip_count": len(rows), "fake_count": fake_count,
            "real_count": real_count, "threshold_fake": threshold,
            "threshold_metrics": {
                "accuracy": (tp + tn) / len(rows),
                "precision_fake": tp / max(1, tp + fp),
                "recall_fake": tp / max(1, tp + fn),
                "false_positive_rate": fp / max(1, real_count),
                "confusion_matrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
            },
            "eer_estimate": {
                "eer": (eer_point["false_accept_rate"] + eer_point["false_reject_rate"]) / 2,
                "threshold": eer_point["threshold"], "false_accept_rate": eer_point["false_accept_rate"],
                "false_reject_rate": eer_point["false_reject_rate"],
            },
            "warning": "Clip-level results apply only to this labeled set; threshold and confidence require held-out calibration.",
        }
    else:
        report = {"model_id": meta["id"], "clip_count": 0, "metrics": None,
                  "warning": "No labeled clips were available. Add 16 kHz mono WAV files and real/fake labels to eval/clips/labels/role1.csv."}
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} clip scores to {OUT} and metrics to {REPORT}.")

if __name__ == "__main__":
    main()
