# Project validation report

**Date:** 2026-10-22
**Scope:** automated project checks and the browser self-test in the harness and Google Chrome. This report does not claim live-call accuracy.

## Passed

- `pnpm verify`: integration check, privacy source check, TypeScript typecheck, all 48 unit tests in 12 test files, and the extension production build.
- `pnpm build:harness`: replay/self-test harness build.
- `git diff --check`: no whitespace errors.
- Browser self-test: all 20 checks passed using the real audio, vision, sync, challenge, and text modules. The run covered synthetic speech, silence, blank-frame handling, face landmarks, and frame-classifier inference.
- Chrome browser self-test: all 20 checks passed on the local harness. This exercises the detector modules, not the installed extension or a live call.
- The harness now previews the production overlay with simulated alert data. This confirms presentation and acknowledgement wiring only; the reasons are synthetic.
- The rebuilt unpacked extension was reloaded in Chrome and its popup opened. It correctly shows Standby on a non-meeting page, keeps the start control disabled, and displays the advisory/privacy copy.
- The synthetic face fixture was detected. Landmark latency was about 34 ms per frame in this run; the frame-classifier smoke score returned in about 1.4 seconds. The score is not an accuracy result.
- Audio-only benchmark proxy: AASIST was evaluated at the project's 0.5 fake threshold on 2,416 scoreable ASVspoof 2021 LA `eval` utterances from three pinned partitions. Balanced accuracy was 89.8%, spoof recall 94.6%, bonafide false-positive rate 15.0%, and ROC AUC 0.963. Short clips and speech-gate rejections were counted as abstentions, not correct real predictions. Details, per-clip scores, and the reproducible evaluator are in `eval/audio/`.

## Still unverified

- Chrome confirmed the unpacked extension is enabled from `apps/extension/dist`; the rebuilt extension was reloaded and the popup was inspected. Chrome requires Developer mode to remain on for this unpacked extension. Only the popup standby state was checked: no meeting tab was used, no tab-capture permission was granted, and no extension capture start/stop E2E result is claimed.
- No live Google Meet or Zoom call was tested. Tab capture, start/stop, source loss/recovery, layout changes, and alert behavior still need a manual Chrome demo check.
- Real-call and full-system accuracy remain unverified. The benchmark proxy uses standalone ASVspoof utterances and tests only AASIST scoring; it does not measure Google Meet/Zoom streams, video deepfake detection, audiovisual sync, liveness, fusion, browser capture, or alert correctness. `eval/clips/labels/audio-eval.csv` and `vision-eval.csv` still contain no project-owned labeled rows.
- The benchmark subset is not the full ASVspoof dataset: it covers three of 24 partitions, and 15,976 of 18,454 eval utterances in those partitions were too short for the model's 4.0375-second window. Conditional metrics apply only to 2,416 scored utterances. The test-set EER threshold is diagnostic and must not be adopted as a deployment threshold.
- No built-extension Network-panel inspection was completed. The source privacy check passed, but dependency behavior and runtime network traffic still need browser-level verification.
- CPU/GPU performance on the intended demonstration laptop has not been benchmarked beyond the single browser smoke-test timing above.

## Demo readiness

The automated build, popup, and browser harness are ready to present as a prototype. For a live extension demonstration, use a consented test call and verify capture start/stop before class. Present the measured browser self-test results separately from detector accuracy claims.
