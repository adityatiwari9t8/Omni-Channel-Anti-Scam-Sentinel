# Sentinel Demonstration Guide (3 minutes)

This script demonstrates the implemented software and its evidence limits. It does not promise that a particular caller or clip will trigger an alert.

## 0:00–0:40 — Explain the problem and privacy design

1. Introduce Sentinel as a student research prototype for combining voice, face-motion, and liveness signals during browser meetings.
2. Show `docs/ARCHITECTURE.md` and point out that capture and inference are designed to run in the browser.
3. Explain that the extension needs tab-capture and meeting-page permissions, and that the local CSP restricts extension-page connections to the extension origin.

## 0:40–1:30 — Run the offline self-test

1. Start the harness with `pnpm harness` and open `http://localhost:5173`.
2. Click **Run self-test**. Show the checks and that inputs include synthetic speech, blank frames, and a bundled test portrait.
3. Click **Show simulated alert** to display the same overlay component used by the extension. Point out the advisory wording and the **Acknowledge** button. It does not analyze call media.
4. Explain that passing contract checks confirms module wiring, not accuracy on real deepfakes.

## 1:30–2:15 — Show replay and fusion

1. Open **Replay** and load a local, consented audio/video sample if available.
2. Show scores and the state timeline. Avoid labeling a clip “real” or “fake” unless it has a defensible ground-truth label.
3. If no suitable clip is available, describe the replay controls and use the unit-test/state-machine examples rather than inventing a result.

## 2:15–3:00 — Results, limitations, and next steps

1. Present the text evaluation alongside its caveat: it uses an LLM-generated corpus and does not predict real-mail performance.
2. State that this project has no labeled real/fake audio or video evaluation set; live-call latency, face-swap accuracy, and challenge rates are not yet measured.
3. Show the next step: collect consented, labeled samples, calibrate thresholds on a separate set, and validate the built extension in Chrome. If showing privacy behavior, capture the Network panel on the final build and report only what was actually observed.
