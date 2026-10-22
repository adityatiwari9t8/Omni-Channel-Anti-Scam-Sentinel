"""Evaluate Sentinel's AASIST audio component on pinned ASVspoof 2021 LA shards.

The input files are Parquet shards from the ASVspoof2021_LA dataset mirror.
Only rows marked phase=eval are used. Clips that cannot fill the detector's
window or contain no usable speech are counted as abstentions, not bonafide.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import io
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort
import pyarrow.parquet as pq
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
DATASET_REVISION = "46df9e62a71f74d0597cd84e3814784b86c6de83"
MODEL_PATH = ROOT / "packages/audio-detector/assets/model.onnx"
META_PATH = ROOT / "packages/audio-detector/assets/meta.json"
SCORER_PATH = Path(__file__).with_name("run_eval.py")


def load_scorer() -> Any:
    spec = importlib.util.spec_from_file_location("sentinel_audio_eval", SCORER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load project scorer at {SCORER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_shards(values: list[str]) -> dict[int, Path]:
    shards: dict[int, Path] = {}
    for value in values:
        try:
            index_text, path_text = value.split("=", 1)
            index = int(index_text)
        except ValueError as exc:
            raise argparse.ArgumentTypeError("Use --shard INDEX=PATH") from exc
        path = Path(path_text).expanduser().resolve()
        if index in shards:
            raise argparse.ArgumentTypeError(f"Duplicate shard index: {index}")
        if not path.is_file():
            raise argparse.ArgumentTypeError(f"Shard file does not exist: {path}")
        shards[index] = path
    if not shards:
        raise argparse.ArgumentTypeError("Supply at least one --shard INDEX=PATH")
    return dict(sorted(shards.items()))


def wilson(successes: int, total: int, z: float = 1.96) -> list[float] | None:
    if total == 0:
        return None
    p = successes / total
    denominator = 1 + z * z / total
    center = (p + z * z / (2 * total)) / denominator
    half = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator
    return [max(0.0, center - half), min(1.0, center + half)]


def auc_rank(labels: np.ndarray, scores: np.ndarray) -> float:
    order = np.argsort(scores, kind="mergesort")
    ranks = np.empty(len(scores), dtype=float)
    i = 0
    while i < len(order):
        j = i + 1
        while j < len(order) and scores[order[j]] == scores[order[i]]:
            j += 1
        ranks[order[i:j]] = (i + 1 + j) / 2
        i = j
    positive = int(labels.sum())
    negative = len(labels) - positive
    return float((ranks[labels == 1].sum() - positive * (positive + 1) / 2) / max(1, positive * negative))


def average_precision(labels: np.ndarray, scores: np.ndarray) -> float:
    """Stepwise area under the precision-recall curve (average precision)."""
    positive = int(labels.sum())
    if positive == 0:
        return 0.0
    order = np.argsort(-scores, kind="mergesort")
    sorted_scores = scores[order]
    sorted_labels = labels[order]
    ends = np.r_[np.flatnonzero(np.diff(sorted_scores)) + 1, len(sorted_scores)]
    cumulative_tp = np.cumsum(sorted_labels)[ends - 1]
    cumulative_fp = ends - cumulative_tp
    recall = cumulative_tp / positive
    precision = cumulative_tp / np.maximum(1, cumulative_tp + cumulative_fp)
    recall_before = np.r_[0.0, recall[:-1]]
    return float(np.sum((recall - recall_before) * precision))


def score_windows(waveform: np.ndarray, meta: dict[str, Any], session: Any, convert: Any) -> tuple[float, float, int]:
    window = int(meta["windowSamples"])
    hop = int(meta["hopSamples"])
    scores: list[float] = []
    confidences: list[float] = []
    for start in range(0, len(waveform) - window + 1, hop):
        sample = waveform[start : start + window].astype(np.float32)
        frames = [sample[i : i + 320] for i in range(0, len(sample), 320)]
        speech_ratio = sum(float(np.sqrt(np.mean(frame * frame))) > meta["silenceRmsThreshold"] for frame in frames) / len(frames)
        if speech_ratio < 0.3:
            continue
        output = session.run([meta["outputName"]], {meta["inputName"]: sample[None, :]})[0]
        score = convert(output, meta)
        margin = min(1.0, abs(score - meta["thresholdFake"]) / 0.25)
        scores.append(score)
        confidences.append(min(1.0, speech_ratio / 0.6) * margin)
    if not scores:
        return 0.0, 0.0, 0
    return float(np.mean(scores)), float(np.mean(confidences)), len(scores)


def summarize(rows: list[dict[str, Any]], counts: Counter[str], shards: dict[int, Path], meta: dict[str, Any]) -> dict[str, Any]:
    scored = [row for row in rows if row["inference_windows"] > 0]
    labels = np.array([1 if row["label"] == "spoof" else 0 for row in scored], dtype=int)
    scores = np.array([row["score_fake"] for row in scored], dtype=float)
    threshold = float(meta["thresholdFake"])
    prediction = scores >= threshold
    tp = int(np.sum((labels == 1) & prediction))
    fp = int(np.sum((labels == 0) & prediction))
    fn = int(np.sum((labels == 1) & ~prediction))
    tn = int(np.sum((labels == 0) & ~prediction))
    tpr = tp / max(1, tp + fn)
    tnr = tn / max(1, tn + fp)
    fpr = fp / max(1, fp + tn)
    precision = tp / max(1, tp + fp)
    accuracy = (tp + tn) / max(1, len(scored))

    eer_points = []
    for cutoff in np.unique(scores):
        predicted = scores >= cutoff
        far = float(np.sum((labels == 0) & predicted) / max(1, np.sum(labels == 0)))
        frr = float(np.sum((labels == 1) & ~predicted) / max(1, np.sum(labels == 1)))
        eer_points.append((abs(far - frr), (far + frr) / 2, float(cutoff), far, frr))
    _, eer, eer_threshold, eer_far, eer_frr = min(eer_points, key=lambda point: point[0])

    attacks: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in scored:
        if row["label"] == "spoof":
            attacks[row["attack_id"]].append(row)
    attack_recall = {
        attack: {"n": len(items), "recall_at_project_threshold": sum(item["score_fake"] >= threshold for item in items) / len(items)}
        for attack, items in sorted(attacks.items())
        if len(items) >= 10
    }
    return {
        "evaluation": "Audio-only ASVspoof 2021 LA proxy; not live meeting-call or audiovisual accuracy",
        "dataset": "SpeechAntiSpoofingBenchmarks/ASVspoof2021_LA",
        "dataset_revision": DATASET_REVISION,
        "dataset_license": "ODC-By (dataset card)",
        "dataset_phase": "eval only (notes.phase == eval)",
        "shards": {str(index): str(path) for index, path in shards.items()},
        "model_id": meta["id"],
        "model_sha256": hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest(),
        "inference_provider": "ONNX Runtime CPU",
        "project_window_seconds": meta["windowSamples"] / meta["sampleRate"],
        "project_threshold_fake": threshold,
        "counts": dict(counts),
        "eligible_clip_count": len(rows),
        "scored_clip_count": len(scored),
        "abstain_count": sum(row["inference_windows"] == 0 for row in rows),
        "scored_class_counts": {"bonafide": int(np.sum(labels == 0)), "spoof": int(np.sum(labels == 1))},
        "coverage_within_selected_eval_shards": {
            "bonafide_window_eligible": counts["eligible_0"] / max(1, counts["eval_0"]),
            "spoof_window_eligible": counts["eligible_1"] / max(1, counts["eval_1"]),
            "bonafide_scored": counts["scored_0"] / max(1, counts["eval_0"]),
            "spoof_scored": counts["scored_1"] / max(1, counts["eval_1"]),
        },
        "metrics_at_project_threshold_on_scored_clips": {
            "accuracy": accuracy,
            "balanced_accuracy": (tpr + tnr) / 2,
            "spoof_precision": precision,
            "spoof_recall": tpr,
            "bonafide_false_positive_rate": fpr,
            "false_negative_rate": fn / max(1, tp + fn),
            "spoof_recall_95ci_wilson": wilson(tp, tp + fn),
            "bonafide_fpr_95ci_wilson": wilson(fp, fp + tn),
            "confusion_matrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
            "roc_auc": auc_rank(labels, scores),
            "pr_auc_average_precision": average_precision(labels, scores),
        },
        "diagnostic_eer_on_scored_clips": {
            "eer": eer,
            "threshold": eer_threshold,
            "far": eer_far,
            "frr": eer_frr,
            "warning": "Diagnostic only; do not deploy a threshold selected from this evaluation set.",
        },
        "spoof_recall_by_attack": attack_recall,
        "limitations": [
            "ASVspoof 2021 LA uses telephony/VoIP coding and transmission conditions, but is not Google Meet or Zoom capture.",
            "Only AASIST audio scoring was evaluated; vision, sync, liveness, fusion, extension capture, and alerts were not tested.",
            "Short utterance files and clips with no usable speech windows are abstentions, not bonafide predictions; coverage is reported separately.",
            "This run covers only the supplied shards, not the full benchmark population.",
            "The project threshold 0.5 is provisional and has not been calibrated on this benchmark.",
            "Wilson confidence intervals are utterance-level and do not account for dependence among clips from the same speaker or attack condition.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--shard", action="append", required=True, metavar="INDEX=PATH", help="Parquet shard, repeat for each shard")
    parser.add_argument("--scores", type=Path, default=Path(__file__).with_name("asvspoof2021_la_proxy_scores.csv"))
    parser.add_argument("--report", type=Path, default=Path(__file__).with_name("asvspoof2021_la_proxy_report.json"))
    args = parser.parse_args()
    shards = parse_shards(args.shard)
    scorer = load_scorer()
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    session = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
    rows: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()

    for shard_index, shard_path in shards.items():
        parquet = pq.ParquetFile(shard_path)
        for row_group in range(parquet.metadata.num_row_groups):
            table = parquet.read_row_group(row_group, columns=["path", "audio", "label", "notes"])
            audio_column = table.column("audio").chunk(0)
            for index, (file_name, raw_label, note_text) in enumerate(zip(table["path"].to_pylist(), table["label"].to_pylist(), table["notes"].to_pylist())):
                note = json.loads(note_text)
                if note.get("phase") != "eval":
                    continue
                label = int(raw_label)  # dataset ClassLabel: 0=bonafide, 1=spoof
                counts[f"eval_{label}"] += 1
                raw_audio = audio_column[index].as_py()["bytes"]
                info = sf.info(io.BytesIO(raw_audio))
                if info.frames < meta["windowSamples"]:
                    counts[f"too_short_{label}"] += 1
                    continue
                counts[f"eligible_{label}"] += 1
                waveform, sample_rate = sf.read(io.BytesIO(raw_audio), dtype="float32", always_2d=False)
                if waveform.ndim == 2:
                    waveform = waveform.mean(axis=1)
                if sample_rate != meta["sampleRate"]:
                    raise ValueError(f"{file_name}: expected {meta['sampleRate']} Hz, got {sample_rate}")
                score, confidence, windows = score_windows(waveform, meta, session, scorer.convert)
                counts[f"{'scored' if windows else 'gate_abstain'}_{label}"] += 1
                rows.append({
                    "clip_id": note.get("utterance_id", Path(file_name).stem),
                    "label": "spoof" if label == 1 else "bonafide",
                    "score_fake": score,
                    "confidence": confidence,
                    "inference_windows": windows,
                    "phase": note["phase"],
                    "speaker_id": note.get("speaker_id", ""),
                    "attack_id": note.get("attack_id", ""),
                    "codec": note.get("codec", ""),
                    "transmission": note.get("transmission", ""),
                    "shard": shard_index,
                    "duration_s": info.duration,
                    "audio_sha256": hashlib.sha256(raw_audio).hexdigest(),
                })
        print(f"Finished shard {shard_index}: {shard_path}", flush=True)

    report = summarize(rows, counts, shards, meta)
    args.scores.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    fields = ["clip_id", "label", "score_fake", "confidence", "inference_windows", "phase", "speaker_id", "attack_id", "codec", "transmission", "shard", "duration_s", "audio_sha256"]
    with args.scores.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows({key: row.get(key, "") for key in fields} for row in rows)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"Scores: {args.scores}\nReport: {args.report}")


if __name__ == "__main__":
    main()
