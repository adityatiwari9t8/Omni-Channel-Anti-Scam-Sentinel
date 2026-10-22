import {
  AUDIO_CHUNK_MS,
  CHALLENGE_PROMPTS,
  type ContentToOffscreen,
  type OffscreenToContent,
  PORT_MEET,
  type SwToOffscreen,
} from "@sentinel/contracts";
import { createArbiter } from "@sentinel/arbiter";
import { createPipeline, type Pipeline } from "@sentinel/pipeline";
import { buildDetectors } from "./detectors";
import { nowMs } from "../shared/clock";
import { b64ToBlob } from "../shared/b64";

let pipeline: Pipeline | null = null;
let playCtx: AudioContext | null = null;
let anaCtx: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let currentPort: chrome.runtime.Port | null = null;

let isFrameProcessing = false;
let lastUpdateSentMs = 0;
let lastAlertState: string = "CLEAR";
let activeArbiter: ReturnType<typeof createArbiter> | null = null;
let lastSentChallenge: string | null = null;
let inferenceGeneration = 0;
let heartbeatHandle: number | null = null;

// Accept connections from content scripts (Meet and Zoom)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_MEET) return;
  currentPort = port;

  port.onMessage.addListener(async (msg: ContentToOffscreen) => {
    if (!msg || msg.v !== 1) return;

    if (msg.t === "HELLO") {
      port.postMessage({
        v: 1,
        t: "STATUS",
        running: pipeline !== null,
        note: "Sentinel inference engine connected",
      } satisfies OffscreenToContent);
      return;
    }

    if (msg.t === "FRAME") {
      if (!pipeline || isFrameProcessing) {
        return; // drop frame if engine not ready or busy
      }
      if (!Number.isInteger(msg.w) || !Number.isInteger(msg.h) || msg.w < 1 || msg.h < 1 ||
          msg.w > 2048 || msg.h > 2048 || msg.w * msg.h > 1_000_000 ||
          typeof msg.jpegB64 !== "string" || msg.jpegB64.length > 1_500_000 || !Number.isFinite(msg.tsMs)) return;
      isFrameProcessing = true;
      let bmp: ImageBitmap | undefined;
      try {
        const blob = b64ToBlob(msg.jpegB64);
        bmp = await createImageBitmap(blob);
        await pipeline.pushFrame(bmp, msg.tsMs);
      } catch (err) {
        console.error("[offscreen] Frame processing error:", err);
      } finally {
        bmp?.close();
        isFrameProcessing = false;
      }
      return;
    }

    if (msg.t === "USER_DISMISS") {
      activeArbiter?.dismiss(nowMs());
      return;
    }
  });

  port.onDisconnect.addListener(() => {
    if (currentPort === port) {
      currentPort = null;
    }
  });
});

// Messages from service worker
chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return;
  const m = msg as SwToOffscreen;
  if (!m || m.v !== 1) return;

  if (m.t === "OFFSCREEN_START") {
    void startInference(m.streamId, m.settings).then(
      () => sendResponse({ ok: true }),
      (error) => sendResponse({ ok: false, error: String(error) }),
    );
    return true;
  }

  if (m.t === "OFFSCREEN_STOP") {
    stopInference();
    return;
  }

  if (m.t === "SETTINGS") {
    if (pipeline) {
      pipeline.setSettings(m.settings);
    }
    return;
  }
});

async function startInference(streamId: string, settings: any): Promise<void> {
  stopInference();
  const generation = ++inferenceGeneration;

  const detectors = buildDetectors(settings);
  const arbiter = createArbiter();
  activeArbiter = arbiter;
  arbiter.setSensitivity(settings.sensitivity);

  const activePipeline = createPipeline(
    {
      audio: detectors.audio,
      vision: detectors.vision,
      sync: detectors.sync,
      challenge: detectors.challenge,
      arbiter,
    },
    {
      logger: (line) => {
        // Output structured telemetry
        console.debug("[sentinel-log]", JSON.stringify(line));
      },
    },
  );
  pipeline = activePipeline;

  const assetBase = chrome.runtime.getURL("");
  try {
    // Consume Chrome's one-use stream ID before loading large local models; the
    // ID expires after only a few seconds if it has not been passed to getUserMedia.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      } as any,
      video: false,
    });
    if (generation !== inferenceGeneration || pipeline !== activePipeline) {
      for (const track of stream.getTracks()) track.stop();
      activePipeline.stop();
      throw new Error("Monitor startup was cancelled");
    }
    mediaStream = stream;

    // 1) Playback context: maintain audible audio for user
    playCtx = new AudioContext();
    const playSource = playCtx.createMediaStreamSource(mediaStream);
    playSource.connect(playCtx.destination);
    await playCtx.resume();

    // 2) Analysis context: 16 kHz chunker (the worklet resamples if needed).
    try { anaCtx = new AudioContext({ sampleRate: 16000 }); }
    catch { anaCtx = new AudioContext(); }
    await anaCtx.audioWorklet.addModule(chrome.runtime.getURL("audio-worklet.js"));
    const workletNode = new AudioWorkletNode(anaCtx, "chunker", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
    });
    workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (generation === inferenceGeneration && pipeline === activePipeline) {
        activePipeline.pushAudio(e.data, nowMs() - AUDIO_CHUNK_MS);
      }
    };

    const anaSource = anaCtx.createMediaStreamSource(mediaStream);
    anaSource.connect(workletNode);
    await anaCtx.resume();

    // Prefer WebGPU where the browser supports it; detectors fall back to CPU/WASM.
    // Capture is already live, so slow model initialization cannot expire streamId.
    await activePipeline.start({ assetBase, preferWebGPU: true });
    if (generation !== inferenceGeneration || pipeline !== activePipeline) {
      activePipeline.stop();
      throw new Error("Monitor startup was cancelled");
    }

    activePipeline.onUpdate((update) => {
      const now = nowMs();
      if (update.out.state === "ALERT" && lastAlertState !== "ALERT" && settings.notifications) {
        chrome.runtime.sendMessage({
          t: "TRIGGER_NOTIFICATION",
          reason: update.out.reasons.join("; ") || "Suspicious call detected.",
        }).catch(() => {});
      }
      lastAlertState = update.out.state;

      if (update.out.state === "CHALLENGE" && update.out.challenge && lastSentChallenge !== update.out.challenge) {
        lastSentChallenge = update.out.challenge;
        currentPort?.postMessage({
          v: 1,
          t: "CHALLENGE",
          challenge: update.out.challenge,
          prompt: CHALLENGE_PROMPTS[update.out.challenge],
          deadlineMs: update.out.challengeDeadlineMs ?? (now + 12000),
        } satisfies OffscreenToContent);
      } else if (update.out.state !== "CHALLENGE") lastSentChallenge = null;

      if (now - lastUpdateSentMs >= 250) {
        lastUpdateSentMs = now;
        currentPort?.postMessage({
          v: 1,
          t: "UPDATE",
          out: update.out,
          audio: update.audio,
          sync: update.sync,
          frame: update.frame,
        } satisfies OffscreenToContent);
      }
    });
    heartbeatHandle = window.setInterval(() => {
      if (generation === inferenceGeneration && pipeline === activePipeline) activePipeline.heartbeat(nowMs());
    }, 500);
  } catch (err) {
    console.error("[offscreen] Monitor startup failed:", err);
    if (generation === inferenceGeneration) stopInference();
    throw err;
  }
}

function stopInference(): void {
  inferenceGeneration++;
  if (heartbeatHandle !== null) {
    window.clearInterval(heartbeatHandle);
    heartbeatHandle = null;
  }
  if (pipeline) {
    pipeline.stop();
    pipeline = null;
  }
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    mediaStream = null;
  }
  if (playCtx) {
    playCtx.close().catch(() => {});
    playCtx = null;
  }
  if (anaCtx) {
    anaCtx.close().catch(() => {});
    anaCtx = null;
  }
  lastAlertState = "CLEAR";
  activeArbiter = null;
  lastSentChallenge = null;
  isFrameProcessing = false;
}
