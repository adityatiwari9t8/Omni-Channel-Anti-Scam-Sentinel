# Vision and sync evaluation

## Current result

Evaluation status: not run. The supplied workspace contains zero labeled media clips and zero detector result rows. The label template, `eval/clips/labels/role2.csv`, contains only its header. No detection rate, false-positive rate, threshold calibration, or challenge comparison can be calculated from the available data.

The implementation is a prototype. Sync settings are initial defaults, not calibrated thresholds. No accuracy claim is supported by the current evidence.

## To run with authorized data

Record consented real and fake sessions, add one row per clip to `eval/clips/labels/role2.csv`, and export detector results to `eval/vision/role2_results.csv`. Both files use these columns: `clip_id,label,sync_score,challenge,challenge_state,artifact_score`. Run:

```sh
python eval/vision/run_eval.py eval/clips/labels/role2.csv eval/vision/role2_results.csv
```

The script reports rates only for matching clip IDs. It uses provisional `sync_score >= 0.5` and `artifact_score >= 0.5` cutoffs; recalibrate these on a separate calibration set before reporting results. Keep holdout clips separate from calibration clips.

See `docs/role2/HANDOVER.md` for the 1-on-1-call and 10 fps resolution limits, and for browser checks that still require a consenting face image.
