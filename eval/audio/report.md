# Audio benchmark proxy evaluation

**Run date:** 2026-10-22

**Scope:** AASIST audio detector only. This is a benchmark proxy, not accuracy on real Google Meet/Zoom calls or the complete Sentinel pipeline.

## Result

The evaluation used all `eval`-phase entries in three of the dataset mirror's 24 Parquet partitions (indices 0, 11, and 23). The model's 4.0375-second window and current fake threshold of 0.5 were used. Only entries with at least one usable inference window were included in conditional metrics. Short files and files rejected by the speech gate are reported as abstentions, never as bonafide predictions. The mirror's dataset card lists an ODC-By license; follow its attribution terms when redistributing derived material.

| Measure | Result |
| --- | ---: |
| Scored utterances | 2,416 (353 bonafide, 2,063 spoof) |
| Balanced accuracy | 89.8% |
| Spoof recall | 94.6% (95% Wilson CI: 93.5–95.5%) |
| Bonafide false-positive rate | 15.0% (95% Wilson CI: 11.7–19.1%) |
| ROC AUC | 0.963 |
| Diagnostic EER | 9.1% at threshold 0.879 |

The EER threshold is calculated on this evaluation subset and is diagnostic only. It must not be adopted as a deployment threshold without independent calibration and holdout evaluation. Accuracy is also affected by this subset's spoof-heavy class mix.

The Wilson intervals are utterance-level binomial intervals; they do not account for dependence among clips from the same speaker or attack condition and may be too narrow.

Of 18,454 eval utterances in the selected partitions, 15,976 were shorter than the model's required 4.0375-second window. Of the remaining 2,478, 62 were rejected by the speech gate. Thus 353/1,841 bonafide and 2,063/16,613 spoof utterances were scored. These are utterance-file coverage rates and must not be interpreted as live-call coverage; live streams can accumulate consecutive windows.

## What this does and does not validate

The ASVspoof 2021 LA benchmark includes telephony/VoIP coding and transmission conditions, but it is not a Google Meet or Zoom capture test ([official dataset record](https://zenodo.org/records/4837263)). The evaluation measures only Sentinel's AASIST audio scoring. It does not validate the video deepfake model, audiovisual sync, liveness challenge, fusion/arbiter, browser tab capture, alert behavior, or overall call-level accuracy. Project-specific real-call accuracy remains unknown until consented, labeled call segments are evaluated.

## Reproduce

The checked-in `run_asvspoof2021_proxy.py` accepts local Parquet shards from the pinned [dataset mirror](https://huggingface.co/datasets/SpeechAntiSpoofingBenchmarks/ASVspoof2021_LA/tree/46df9e62a71f74d0597cd84e3814784b86c6de83). It requires Python packages `numpy`, `onnxruntime`, `pyarrow`, and `soundfile`. Example, after downloading the three indicated Parquet files:

```sh
python eval/audio/run_asvspoof2021_proxy.py \
  --shard 0=/path/to/shard-0.parquet \
  --shard 11=/path/to/shard-11.parquet \
  --shard 23=/path/to/shard-23.parquet
```

The command writes per-utterance scores and a detailed JSON report beside the script. The CSV contains metadata, hashes, and scores, not audio content. The checked-in `asvspoof2021_la_proxy_scores.csv` and `asvspoof2021_la_proxy_report.json` record this run.

## Project-owned data

No project-owned labeled voice clips were supplied; `eval/clips/labels/audio-eval.csv` has no labeled rows. To measure performance on the intended use case, collect consented and labeled real/fake call segments, keep speakers and call sources separated between calibration and holdout, and evaluate abstentions/coverage as well as errors. Measure end-to-end behavior separately in the target browser and call platform. Until then, do not describe these proxy results as live-call accuracy.
