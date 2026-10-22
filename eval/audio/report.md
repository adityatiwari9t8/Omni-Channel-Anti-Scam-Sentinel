# Audio evaluation status

The bundled model is the MIT-licensed AASIST ASVspoof2019-LA ONNX export. No project-owned labeled voice clips were supplied, so no package-level accuracy, EER, threshold, or latency claim is available yet.

Add consented, speaker-matched 16 kHz mono WAVs under `eval/clips/` and fill `eval/clips/labels/role1.csv` with `clip_id,file,speaker,label,tool,has_audio,has_video,notes`. Labels must be `real` or `fake`. Run `python eval/audio/run_eval.py`; it writes per-clip scores and a JSON report with threshold metrics and an empirical EER estimate. Keep a speaker/tool holdout separate from threshold calibration.

Upstream AASIST benchmark results are listed in the package model card and are context only. The 0.5 package threshold and the confidence margin remain provisional until this project's clips are evaluated. Runtime latency should be measured in the target browser after model initialization; CPU-only Python measurements are not substitutes.
