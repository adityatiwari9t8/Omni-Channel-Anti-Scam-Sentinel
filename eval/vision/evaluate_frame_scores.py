"""Evaluate exported frame-classifier scores with video/source-disjoint splits.

Input rows are sampled frames (one row per frame, including blank scores for
no-face/abstained frames). This script does not run the ONNX model.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

REQUIRED = {"split", "video_id", "person_id", "source_id", "frame_id", "label", "score_fake"}
GROUP_KEYS = ("video_id", "person_id", "source_id")


def parse_label(value: str) -> bool:
    label = value.strip().lower().replace(" ", "")
    if label in {"fake", "deepfake", "synthetic", "1"}:
        return True
    if label in {"real", "bonafide", "genuine", "0"}:
        return False
    raise ValueError(f"Unsupported label {value!r}; use real/fake")


def load_rows(path: Path) -> list[dict[str, Any]]:
    with path.open(newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        missing = REQUIRED - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing))}")
        rows = []
        frame_keys = set()
        video_identity: dict[str, tuple[str, str, str, str]] = {}
        for raw in reader:
            split = (raw.get("split") or "").strip().lower()
            if split not in {"train", "validation", "test"}:
                raise ValueError(f"{raw.get('video_id')}: split must be train, validation, or test")
            video_id = (raw.get("video_id") or "").strip()
            person_id = (raw.get("person_id") or "").strip()
            source_id = (raw.get("source_id") or "").strip()
            frame_id = (raw.get("frame_id") or "").strip()
            if not all((video_id, person_id, source_id, frame_id)):
                raise ValueError("video_id, person_id, source_id, and frame_id must be non-empty")
            label = parse_label(raw.get("label") or "")
            key = (split, video_id, frame_id)
            if key in frame_keys:
                raise ValueError(f"Duplicate frame row: {key}")
            frame_keys.add(key)
            identity = (split, person_id, source_id, "fake" if label else "real")
            if video_id in video_identity and video_identity[video_id] != identity:
                raise ValueError(f"Video {video_id!r} has inconsistent split, person, source, or label")
            video_identity[video_id] = identity
            score_text = (raw.get("score_fake") or "").strip()
            score = None if not score_text else float(score_text)
            if score is not None and (not math.isfinite(score) or not 0 <= score <= 1):
                raise ValueError(f"{video_id}/{frame_id}: score_fake must be blank or in [0, 1]")
            rows.append({**raw, "split": split, "video_id": video_id, "person_id": person_id,
                         "source_id": source_id, "frame_id": frame_id, "label_fake": label,
                         "score": score})
    if not rows:
        raise ValueError("CSV contains no frame rows")
    return rows


def assert_disjoint(rows: list[dict[str, Any]]) -> None:
    for key in GROUP_KEYS:
        membership: dict[str, set[str]] = defaultdict(set)
        for row in rows:
            membership[row[key]].add(row["split"])
        collisions = [value for value, splits in membership.items() if len(splits) > 1]
        if collisions:
            raise ValueError(f"{key} appears in multiple splits: {', '.join(collisions[:5])}")


def roc_auc(labels: list[bool], scores: list[float]) -> float | None:
    positives = sum(labels)
    negatives = len(labels) - positives
    if not positives or not negatives:
        return None
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


def pr_average_precision(labels: list[bool], scores: list[float]) -> float | None:
    positives = sum(labels)
    if not positives:
        return None
    ordered = sorted(zip(scores, labels), key=lambda item: item[0], reverse=True)
    tp = fp = 0
    previous_recall = 0.0
    result = 0.0
    i = 0
    while i < len(ordered):
        j = i + 1
        while j < len(ordered) and ordered[j][0] == ordered[i][0]:
            j += 1
        for _, label in ordered[i:j]:
            tp += int(label)
            fp += int(not label)
        recall = tp / positives
        result += (recall - previous_recall) * tp / (tp + fp)
        previous_recall = recall
        i = j
    return result


def choose_video_threshold(video_rows: list[dict[str, Any]]) -> float:
    scored = [row for row in video_rows if row["score"] is not None]
    labels = [row["label_fake"] for row in scored]
    scores = [row["score"] for row in scored]
    if not labels or not any(labels) or all(labels):
        raise ValueError("Validation video scores must contain both real and fake videos")
    candidates = sorted({0.0, 1.0, *scores})
    ranked = []
    for threshold in candidates:
        tp = sum(label and score >= threshold for label, score in zip(labels, scores))
        fp = sum(not label and score >= threshold for label, score in zip(labels, scores))
        fn = sum(label and score < threshold for label, score in zip(labels, scores))
        tn = sum(not label and score < threshold for label, score in zip(labels, scores))
        balanced_accuracy = (tp / (tp + fn) + tn / (tn + fp)) / 2
        ranked.append((-balanced_accuracy, abs(threshold - 0.5), threshold))
    return min(ranked)[2]


def summarize(rows: list[dict[str, Any]], threshold: float) -> dict[str, Any]:
    scored = [row for row in rows if row["score"] is not None]
    labels = [row["label_fake"] for row in scored]
    scores = [row["score"] for row in scored]
    total_fake = sum(row["label_fake"] for row in rows)
    total_real = len(rows) - total_fake
    tp = sum(label and score >= threshold for label, score in zip(labels, scores))
    fp = sum(not label and score >= threshold for label, score in zip(labels, scores))
    fn = sum(label and score < threshold for label, score in zip(labels, scores))
    tn = sum(not label and score < threshold for label, score in zip(labels, scores))
    positive_count, negative_count = sum(labels), len(labels) - sum(labels)
    return {
        "rows": len(rows),
        "scored": len(scored),
        "abstentions": len(rows) - len(scored),
        "coverage": len(scored) / len(rows) if rows else None,
        "total_class_counts": {"real": total_real, "fake": total_fake},
        "scored_class_counts": {"real": negative_count, "fake": positive_count},
        "coverage_by_class": {
            "real": negative_count / total_real if total_real else None,
            "fake": positive_count / total_fake if total_fake else None,
        },
        "threshold": threshold,
        "accuracy": (tp + tn) / len(scored) if scored else None,
        "balanced_accuracy": ((tp / positive_count + tn / negative_count) / 2
                              if positive_count and negative_count else None),
        "fake_recall": tp / positive_count if positive_count else None,
        "real_false_positive_rate": fp / negative_count if negative_count else None,
        "false_negative_rate": fn / positive_count if positive_count else None,
        "confusion_matrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
        "roc_auc": roc_auc(labels, scores) if scored else None,
        "pr_auc_average_precision": pr_average_precision(labels, scores) if scored else None,
    }


def aggregate_videos(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[row["video_id"]].append(row)
    videos = []
    for video_id, frames in groups.items():
        scores = [frame["score"] for frame in frames if frame["score"] is not None]
        first = frames[0]
        videos.append({"video_id": video_id, "label_fake": first["label_fake"],
                       "score": max(scores) if scores else None})
    return videos


def condition_breakdown(rows: list[dict[str, Any]], threshold: float) -> dict[str, Any]:
    result = {}
    for field in ("compression", "resolution", "quality"):
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            value = (row.get(field) or "").strip()
            if value:
                groups[value].append(row)
        if groups:
            result[field] = {value: summarize(group, threshold) for value, group in sorted(groups.items())}
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scores", type=Path, help="Frame score CSV kept outside Git when it contains local media details")
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--license", required=True)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("frame-classifier-report.json"))
    args = parser.parse_args()

    rows = load_rows(args.scores)
    assert_disjoint(rows)
    by_split = {split: [row for row in rows if row["split"] == split] for split in ("train", "validation", "test")}
    if not by_split["validation"] or not by_split["test"]:
        raise ValueError("CSV must contain separate validation and test splits")
    threshold = choose_video_threshold(aggregate_videos(by_split["validation"]))
    reports = {}
    for split in ("validation", "test"):
        frames = by_split[split]
        videos = aggregate_videos(frames)
        reports[split] = {
            "frame_level": summarize(frames, threshold),
            "video_level": summarize(videos, threshold),
            "test_frame_quality_breakdown": condition_breakdown(frames, threshold) if split == "test" else {},
        }
    report = {
        "dataset": args.dataset,
        "dataset_revision": args.revision,
        "dataset_license": args.license,
        "test_threshold": threshold,
        "threshold_selection": "Choose threshold maximizing balanced accuracy on validation video scores; ties choose the threshold closest to 0.5. Freeze it before test evaluation.",
        "video_aggregation": "Maximum non-abstaining frame score per source video; a video with no scored frames abstains.",
        "split_integrity": "Video, person, and source IDs are required to be disjoint across train, validation, and test.",
        "results": reports,
        "limitations": [
            "This script summarizes exported per-frame scores; it does not run the browser ONNX adapter.",
            "Metrics are conditional on scored frames/videos; coverage and abstentions are reported separately.",
            "Frame-level scores from a video are correlated and are not independent samples.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote frame/video evaluation report to {args.output}")


if __name__ == "__main__":
    main()
