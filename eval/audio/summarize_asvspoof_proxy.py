"""Recompute aggregate metrics from the checked-in ASVspoof proxy score CSV.

This summarizes saved per-utterance scores. It does not rerun ONNX inference and
must not be described as reproducing the original scoring pass.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SCORES = ROOT / "eval/audio/asvspoof2021_la_proxy_scores.csv"
DEFAULT_SOURCE_REPORT = ROOT / "eval/audio/asvspoof2021_la_proxy_report.json"
DEFAULT_OUTPUT = ROOT / "eval/audio/asvspoof2021_la_proxy_recomputed_metrics.json"


def normalized_label(value: str) -> bool:
    label = value.strip().lower().replace(" ", "")
    if label in {"spoof", "fake", "synthetic", "1"}:
        return True
    if label in {"bonafide", "real", "genuine", "0"}:
        return False
    raise ValueError(f"Unsupported audio label: {value!r}")


def auc_roc(labels: list[bool], scores: list[float]) -> float:
    positives = sum(labels)
    negatives = len(labels) - positives
    if not positives or not negatives:
        raise ValueError("ROC AUC requires both classes")
    ordered = sorted(zip(scores, labels))
    rank_sum = 0.0
    i = 0
    while i < len(ordered):
        j = i + 1
        while j < len(ordered) and ordered[j][0] == ordered[i][0]:
            j += 1
        average_rank = ((i + 1) + j) / 2
        rank_sum += average_rank * sum(label for _, label in ordered[i:j])
        i = j
    return (rank_sum - positives * (positives + 1) / 2) / (positives * negatives)


def average_precision(labels: list[bool], scores: list[float]) -> float:
    positives = sum(labels)
    if not positives:
        raise ValueError("Average precision requires at least one positive")
    ordered = sorted(zip(scores, labels), key=lambda row: row[0], reverse=True)
    true_positives = false_positives = 0
    previous_recall = 0.0
    result = 0.0
    i = 0
    while i < len(ordered):
        j = i + 1
        while j < len(ordered) and ordered[j][0] == ordered[i][0]:
            j += 1
        for _, label in ordered[i:j]:
            true_positives += int(label)
            false_positives += int(not label)
        recall = true_positives / positives
        precision = true_positives / (true_positives + false_positives)
        result += (recall - previous_recall) * precision
        previous_recall = recall
        i = j
    return result


def rates_at_threshold(labels: list[bool], scores: list[float], threshold: float) -> dict[str, Any]:
    tp = sum(label and score >= threshold for label, score in zip(labels, scores))
    fp = sum(not label and score >= threshold for label, score in zip(labels, scores))
    fn = sum(label and score < threshold for label, score in zip(labels, scores))
    tn = sum(not label and score < threshold for label, score in zip(labels, scores))
    positive_count, negative_count = sum(labels), len(labels) - sum(labels)
    recall = tp / positive_count
    specificity = tn / negative_count
    return {
        "threshold": threshold,
        "accuracy": (tp + tn) / len(labels),
        "balanced_accuracy": (recall + specificity) / 2,
        "spoof_recall": recall,
        "bonafide_false_positive_rate": fp / negative_count,
        "false_negative_rate": fn / positive_count,
        "confusion_matrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
    }


def diagnostic_eer(labels: list[bool], scores: list[float]) -> dict[str, float]:
    points = []
    for threshold in sorted({0.0, 1.0, *scores}):
        row = rates_at_threshold(labels, scores, threshold)
        far = row["bonafide_false_positive_rate"]
        frr = row["false_negative_rate"]
        points.append((abs(far - frr), (far + frr) / 2, threshold, far, frr))
    _, eer, threshold, far, frr = min(points)
    return {"eer": eer, "threshold": threshold, "far": far, "frr": frr}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scores", type=Path, default=DEFAULT_SCORES)
    parser.add_argument("--source-report", type=Path, default=DEFAULT_SOURCE_REPORT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    eligible_rows = []
    with args.scores.open(newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            label = normalized_label(row["label"])
            score = float(row["score_fake"])
            if not math.isfinite(score) or not 0 <= score <= 1:
                raise ValueError(f"Invalid score for {row.get('clip_id', '<unknown>')}")
            eligible_rows.append((row, label, score))
    if not eligible_rows:
        raise ValueError("Score CSV contains no scored clips")

    source_report = json.loads(args.source_report.read_text(encoding="utf-8"))
    rows = [item for item in eligible_rows if int(item[0].get("inference_windows", "0")) > 0]
    if len(eligible_rows) != source_report["eligible_clip_count"]:
        raise ValueError("Score CSV eligible-row count does not match the source report")
    if len(rows) != source_report["scored_clip_count"]:
        raise ValueError("Rows with inference windows do not match the source report's scored count")
    eligible_labels = Counter(label for _, label, _ in eligible_rows)
    scored_labels = Counter(label for _, label, _ in rows)
    if eligible_labels[False] != source_report["counts"]["eligible_0"] or eligible_labels[True] != source_report["counts"]["eligible_1"]:
        raise ValueError("Score CSV eligible class counts do not match the source report")
    if scored_labels[False] != source_report["counts"]["scored_0"] or scored_labels[True] != source_report["counts"]["scored_1"]:
        raise ValueError("Score CSV scored class counts do not match the source report")
    labels = [label for _, label, _ in rows]
    scores = [score for _, _, score in rows]
    threshold = float(source_report["project_threshold_fake"])
    counts = source_report["counts"]
    coverage = {
        "selected_eval_utterances": counts["eval_0"] + counts["eval_1"],
        "scored_utterances": len(rows),
        "overall_scored_fraction_of_selected_eval": len(rows) / (counts["eval_0"] + counts["eval_1"]),
        "bonafide_scored_fraction_of_selected_eval": counts["scored_0"] / counts["eval_0"],
        "spoof_scored_fraction_of_selected_eval": counts["scored_1"] / counts["eval_1"],
        "eligible_utterances": source_report["eligible_clip_count"],
        "scored_fraction_of_window_eligible": len(rows) / source_report["eligible_clip_count"],
        "abstentions_after_window_eligibility": source_report["abstain_count"],
    }
    hashes = [row.get("audio_sha256", "") for row, _, _ in rows]
    duplicate_hashes = sum(count > 1 for value, count in Counter(hashes).items() if value)
    speakers = {row.get("speaker_id", "") for row, _, _ in rows if row.get("speaker_id", "")}
    report = {
        "evaluation": "Recomputed aggregate metrics from checked-in ASVspoof 2021 LA per-utterance scores; no inference rerun",
        "dataset": source_report["dataset"],
        "dataset_revision": source_report["dataset_revision"],
        "dataset_license": source_report["dataset_license"],
        "selected_shard_indices": sorted(int(index) for index in source_report["shards"]),
        "label_mapping": {"bonafide": "human speech (dataset label 0)", "spoof": "spoofed/TTS/voice-converted speech (dataset label 1)"},
        "model_id": source_report["model_id"],
        "model_sha256": source_report["model_sha256"],
        "preprocessing": "16 kHz mono float32, stereo averaged if present, no resampling or normalization, 64,600-sample window, 32,300-sample hop, existing speech gate; only windows with inference_windows > 0 enter conditional metrics",
        "scored_counts": {
            "bonafide": sum(not label for label in labels),
            "spoof": sum(labels),
            "unique_speakers": len(speakers),
            "duplicate_nonempty_audio_hashes": duplicate_hashes,
        },
        "coverage": coverage,
        "metrics_at_frozen_project_threshold": rates_at_threshold(labels, scores, threshold),
        "roc_auc": auc_roc(labels, scores),
        "pr_auc_average_precision": average_precision(labels, scores),
        "diagnostic_eer_on_scored_eval_only": diagnostic_eer(labels, scores),
        "threshold_note": "0.5 is the shipped provisional interface threshold, not selected on this evaluation subset. The EER threshold is diagnostic only and must not be adopted for deployment.",
        "limitations": [
            "Recomputes summary statistics from tracked scores and provenance counts; does not rerun the ONNX model.",
            "The source score file covers only selected ASVspoof 2021 LA eval shards and only utterances with a usable full model window.",
            "ASVspoof 2021 LA is a telephony/VoIP benchmark, not labeled consented Meet/Zoom call data.",
            "Scores from utterances with the same speaker or attack condition are not independent; reported metrics have no cluster-adjusted uncertainty.",
        ],
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote recomputed metrics to {args.output}")


if __name__ == "__main__":
    main()
