# Audio and vision model training status

**Status date:** 2026-10-22

No audio or vision model was trained or fine-tuned for this change. The available evidence supports a reproducible summary of the saved audio proxy scores and regression tests for the shipped model contracts; it does not support selecting or shipping a new model.

## Why there is no training result

- **Audio:** the checked-in ASVspoof 2021 LA material is an evaluation-only proxy on three selected shards. It remains held out. The source Parquet shards are not present locally. ASVspoof 2019 train/dev data is registration-gated; its applicable terms and permission to distribute a derived model were not established for this work.
- **Vision:** no labeled real/fake frame or video dataset is present. The vision CSV contains only its header. The synthetic self-test portrait is not training or evaluation data. The current CommunityForensics model is an image classifier; its upstream MIT license does not include a complete license/provenance inventory for its source images.
- **Hardware/runtime:** `nvidia-smi` detects an NVIDIA GeForce RTX 4050 with 6,141 MiB memory and driver 610.62 (CUDA UMD 13.3). The available Python 3.12.14 runtime has NumPy, but no PyTorch, ONNX Runtime, PyArrow, or SoundFile; no ML framework CUDA check, mixed-precision setting, training batch, or training run was possible. No training packages were installed.

Downloaded data, recordings, checkpoints, and caches must remain outside Git. Any future training must verify dataset terms for both research use and model distribution, pin the dataset revision, deduplicate source media, and split by speaker/person and source/generator before model or threshold selection. Keep the final test split sealed until configuration is frozen.

## Layout

- `training/audio/README.md` records the audio dataset and checkpoint decision.
- `training/vision/README.md` records the vision dataset and checkpoint decision.
- `eval/audio/` and `eval/vision/` contain score evaluation and result reports. The current audio summary script recomputes metrics from saved scores; the vision CLI reports metrics from exported frame scores. Neither performs training or hidden-state-dependent notebook work.

## Reproduce the available evidence

Recompute the saved audio proxy metrics with the Python standard library:

```sh
python eval/audio/summarize_asvspoof_proxy.py
```

This validates the tracked per-utterance score file and its provenance counts; it does not rerun ONNX inference. Rerunning inference requires the pinned local Parquet shards and the packages listed in `eval/audio/report.md`.

The TypeScript preprocessing, model metadata, score mapping, low-quality gate, and no-face behavior are covered by:

```sh
pnpm test
```

No real-call accuracy is claimed. The project validation commands and browser-check boundary are recorded in the module reports and `docs/validation-report.md`.
