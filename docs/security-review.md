# Sentinel security and bypass review

**Review date:** 2026-10-22
**Scope:** Source review of the current Chrome extension, model wiring, fusion logic, challenge verifier, Gmail banner, and replay harness. This is a threat review, not a penetration test. No adversarial media, independent accuracy benchmark, or live Meet/Zoom test was run for this review.

## What the prototype does well

- Runs audio, video, and email analysis locally in the browser. The extension's source checks and extension-page CSP are designed to prevent outbound model/data traffic.
- Combines distinct signal types: AASIST audio anti-spoofing, lip/audio correlation, facial landmarks and motion, an experimental pretrained image score, and a text phishing model.
- Uses a real Chrome Manifest V3 extension, an offscreen capture/inference page, ONNX Runtime Web with WebGPU/WASM paths, and MediaPipe Tasks Vision rather than presenting only a notebook or static mockup.
- Separates detectors, contracts, fusion, liveness challenges, and the UI into TypeScript workspace packages. The arbiter includes dwell times, hysteresis, and a challenge/alert state machine.
- Includes a replay/self-test harness, model cards, evaluation notes, a build, and privacy checks. It records the limits of the current metrics instead of claiming live-call accuracy.
- Bundles models for offline inference after installation. The CPU/WASM path means a GPU is not required, although CPU performance may be slow.

These are meaningful BTech project strengths: integration, applied ML, privacy-aware design, UI, and reproducible engineering are demonstrated together. They do not establish that the detector is accurate or resistant to an adaptive attacker.

## Bypass paths and remaining risks

| Priority | Bypass or defect | Why it can work | Improvement needed |
|---|---|---|---|
| Critical boundary | A user with control of the computer can stop or disable the extension, remove its permissions, change sensitivity, replace the extension files, or alter the browser/media source. | Sentinel runs entirely on the same client it is trying to assess. A local-only extension cannot prove to itself that its own code or input stream has not been changed. | Describe Sentinel as an advisory client-side signal. A managed deployment would need signed/policy-controlled installation and a separate trusted verifier; that changes the privacy and deployment model. |
| High | Pin or select a clean participant tile while a different participant is suspicious. | Meet/Zoom capture currently selects a largest visible video/canvas element. It does not bind the captured face to a specific person or analyze every participant. | Add an explicit participant selector and track identity across video and audio; provide per-participant coverage and a visible “not monitored” state. |
| High | Use modern cloned speech or replayed speech with a real face and convincing lip motion. | The bundled AASIST model is based on ASVspoof 2019 LA. Domain shift, codecs, loudspeakers, noise, and newer generation systems can change its scores. Correlation can look normal when audio and mouth motion are deliberately synchronized. | Evaluate with speaker-, generator-, and codec-disjoint data. Add current voice-cloning/replay examples and report false-positive/false-negative rates at a chosen operating point. |
| High | Use a face swap or reenactment that preserves ordinary-looking frame texture, especially after video compression, low resolution, lighting changes, or partial occlusion. | The bundled CommunityForensics model is an image/frame classifier, not a video-level face-swap detector. A score is sampled at most every two seconds and has not been calibrated on this project's video. | Replace or supplement it with a face-manipulation model validated on compressed video and temporal sequences; evaluate by source and generator, then calibrate the score. |
| High | Perform the requested movement with a real-time reenactment, a prepared clip, or a live human. | Head turns, covering a face, and showing fingers are simple visible actions. They test response to a prompt, not identity. A small known challenge bank is not an authentication secret. | Keep challenges as one liveness signal only. For stronger assurance, use unpredictable, time-bound prompts, temporal consistency checks, and an identity/provenance method; still evaluate replay attacks. |
| High | Stop or degrade the camera/audio stream while relying on another signal that appears benign. | Before this review, the UI could stay green while the pipeline had no fresh evidence, and old scores could remain in fusion. The code now ages scores out, pulses the arbiter, and shows “NO DATA”/stale-signal reasons. Capture-source loss still needs live-browser validation. | Check loss/recovery and black-frame cases in Chrome. Keep missing evidence explicit and never describe it as a safe result. |
| High | Enable mock detectors, then present their output as real inference. | The popup exposed mock toggles in the normal build, making it easy to generate scripted behavior instead of analyzing media. The production build now hides these controls and ignores mock settings; the toggles remain for watch/development builds. | Build and submit the normal production package. Verify the unpacked release has real detectors and the model assets. |
| Medium | Get a suspicious email past the text model using a new campaign style, another language, homoglyphs/Unicode tricks, image or QR content, or an attachment. | The model's large reported score comes from an LLM-generated English corpus with a random split. The Gmail detector reads an opened message's DOM text, links, and sender fields; it does not OCR images or inspect attachments. | Use independently sourced, time/campaign-separated mail for evaluation; add multilingual and obfuscation fixtures, URL reputation checks, image/QR OCR, and attachment scanning only with clear consent and privacy review. |
| Medium | Exploit multi-party layouts, virtual cameras, browser/page manipulation, or platform UI changes to make the DOM video differ from the person of interest. | The extension samples page-visible video/canvas elements and depends on platform DOM behavior. Local browser code and virtual-camera inputs are not trusted sensors. | Validate selectors on supported versions; show which source is being monitored; test source switching and hidden/decoy tiles. Treat platform capture as an untrusted input boundary. |
| Medium | Run on a low-powered device or block GPU initialization so inference is late or unavailable. | The visual model asset is about 87 MB (83 MiB) and CPU/WASM inference may be slow. A late, unavailable, or dropped signal can reduce evidence and delay an alert. | Show initialization/backend health, measure CPU/memory and end-to-end delay on target devices, and keep the visible state at “loading,” “degraded,” or “no data” as appropriate. |

## Fixes made during this review

- Fusion now ignores stale audio, synchronization, and frame results; the pipeline can re-evaluate freshness when capture pauses.
- A `CLEAR` state with no evidence is rendered as **NO DATA**, not as a green safe result.
- The overlay's Dismiss control now reaches the arbiter.
- Repeated challenge messages no longer restart the overlay timer, and challenge state is cleared when a challenge ends.
- The “raise fingers” challenge now checks for at least three extended fingers, and challenges reject long gaps between observed frames. This makes the prompt match the check; it does not make the challenge secure authentication.
- The replay harness now feeds audio through the worklet into the same pipeline, supports a visual fusion-weight control, and releases replaced local clip URLs.
- Pipeline frame/audio jobs and extension startup are guarded against stop/restart races. Failed startup is reported to the popup instead of looking like active monitoring.
- The one-use tab-capture stream ID is consumed before loading the large models; Chrome expires unused IDs after a few seconds.
- Frame messages are size/dimension checked before image decoding, and failed frame processing closes its bitmap.
- Production builds cannot enable scripted mock detectors through the popup/settings.
- The in-call overlay now distinguishes missing evidence from a clear signal, uses advisory alert wording, announces status changes for assistive technology, and labels the alert action as acknowledge.
- Popup and background start/stop checks now validate HTTPS Meet and Zoom hostnames instead of using substring matches; lookalike domains are rejected.
- The harness now previews the same production overlay component with synthetic reasons, so a class demo does not depend on a real alert occurring.
- Missing pretrained visual-model availability is reported as an explicit signal reason.
- Extension and harness builds now copy only the ONNX Runtime WebAssembly loader/binary pair referenced by the pinned WebGPU bundle; built outputs are about 178 MiB instead of 231 MiB.

## Recommended next work

1. **Complete a live-browser demo check:** load the production build in Chrome; exercise start, stop, dismissed alerts, tab navigation, camera/microphone loss, and startup on CPU-only hardware. Capture screenshots/video and note the exact browser/device.
2. **Build a labeled evaluation set:** use consented real and manipulated voice/video/email examples. Split by speaker/person, generator/tool, source clip, and recording session—not random adjacent samples. Keep calibration and final holdout sets separate.
3. **Report detector metrics honestly:** confusion matrix, precision, recall, false-positive rate, false-negative rate, ROC/PR curves, EER where suitable, calibration, and time-to-alert. Include sample counts and confidence intervals.
4. **Measure runtime costs:** model initialization, median/p95 inference, CPU/GPU, memory, dropped frames/audio windows, and alert delay on the intended demo laptop.
5. **Improve video evidence:** use person-specific tracking and a video-level manipulation detector; sample enough frames to catch short events while respecting performance. Report no-face and unsupported-layout coverage.
6. **Improve challenge evaluation:** test replayed gesture clips, real-time reenactment, camera cuts, occlusion, and missing frames. Do not equate a passed gesture with verified identity.
7. **Improve email coverage:** evaluate current phishing campaigns and benign lookalikes, non-English email, encoded URLs, QR images, and attachments. The present classifier should remain an advisory warning.

## Evidence status

- `pnpm verify` passes: integration, source privacy, typecheck, 48 unit tests across 12 files, and extension build. `pnpm build:harness` also passes.
- The browser self-test passes all 20 checks using real modules and a synthetic face fixture. It now checks frame-classifier availability and inference output; the generated score is a smoke test, not an accuracy result.
- The production build was reloaded and confirmed enabled in Chrome; the popup standby state was inspected. The unpacked extension requires Developer mode to remain on. The tab-capture start/stop flow, extension runtime network traffic, and live Meet/Zoom behavior were not validated in this review.
- Project-owned labeled audio/video evaluation data: none included.
- Live-call accuracy and end-to-end latency: not measured.
- Browser Network-panel check on the built extension: not performed in this review. The source privacy check/CSP are supporting controls, not a substitute for observing the running browser.
- The text model's high corpus metrics and its 20-message fixture result are documented in `eval/text/report.md`; neither estimates general performance on real inboxes.
