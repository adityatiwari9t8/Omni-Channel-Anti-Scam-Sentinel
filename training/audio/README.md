# Audio model training record

No new training or fine-tuning was performed. The shipped model remains AASIST ONNX with the input contract in `packages/audio-detector/assets/meta.json`: mono raw float32 at 16 kHz, `[1,64600]`, first 64,600 samples per window, 32,300-sample hop, no normalization, `wav` input, `logits` output, class index 0 spoof. Its model hash is `130e536266b7c537f9a13029e1612a9f392fd1cc827783683b6d1c062a3db5e1`.

## Data decision

- **Dataset/source/revision/license:** `SpeechAntiSpoofingBenchmarks/ASVspoof2021_LA`, pinned mirror revision [`46df9e62a71f74d0597cd84e3814784b86c6de83`](https://huggingface.co/datasets/SpeechAntiSpoofingBenchmarks/ASVspoof2021_LA/tree/46df9e62a71f74d0597cd84e3814784b86c6de83); its dataset card declares ODC-By. The [official ASVspoof 2021 page](https://www.asvspoof.org/index2021.html) identifies the challenge databases as Open Data Commons Attribution. The [official LA record](https://zenodo.org/records/4837263) describes bona fide and TTS/voice-conversion spoof speech transmitted through telephony/VoIP. The source files were not downloaded during this task; the saved-score run is dated 2026-10-22.
- **Labels/preprocessing:** mirror label `0` is bona fide and `1` is spoof. The scorer reads eval-phase audio only, decodes float32, downmixes stereo by averaging channels, requires 16 kHz without resampling, uses raw unnormalized samples in the existing 64,600-sample window / 32,300-sample hop, and abstains if no window passes the existing speech gate. No file is padded into a confident real result.
- **Split/selection:** only `phase=eval` rows from shard indices 0, 11, and 23 were scored. This is a selected external evaluation subset, not a train/validation split. No row was used for training, threshold selection, or hyperparameter selection. The shipped interface threshold remains 0.5.
- The evaluation subset is not project call data. Of 18,454 selected eval utterances, 15,976 were shorter than one model window; 62 of 2,478 remaining rows were speech-gate abstentions. Metrics apply only to the 2,416 scored utterances.
- ASVspoof 2019 train/dev audio is not in the workspace. The official challenge page describes registration for access; this work did not obtain it or establish whether a derived ONNX model could be distributed under the relevant corpus terms.
- No project-owned consented voice clips are available. No raw audio or dataset access token is tracked.

No training configuration, batch size, precision mode, validation threshold, or export command applies because no training or fine-tuning occurred.

## Available evaluation commands

Recompute aggregate metrics from the checked-in score CSV and report, without model inference or third-party packages:

```sh
python eval/audio/summarize_asvspoof_proxy.py
```

The output is `eval/audio/asvspoof2021_la_proxy_recomputed_metrics.json`. The inference rerun requires external Parquet shards and NumPy, ONNX Runtime, PyArrow, and SoundFile:

```sh
python eval/audio/run_asvspoof2021_proxy.py \
  --shard 0=/path/to/shard-0.parquet \
  --shard 11=/path/to/shard-11.parquet \
  --shard 23=/path/to/shard-23.parquet
```

The exact saved results, threshold note, coverage, caveats, and source links are in `eval/audio/report.md`. No training dependency or checkpoint was added because this workspace has no eligible training data and no model-distribution clearance.
