import {
  AUDIO_CHUNK_MS,
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
      isFrameProcessing = true;
      try {
        const blob = b64ToBlob(msg.jpegB64);
        const bmp = await createImageBitmap(blob);
        await pipeline.pushFrame(bmp, msg.tsMs);
        bmp.close();
      } catch (err) {
        console.error("[offscreen] Frame processing error:", err);
      } finally {
        isFrameProcessing = false;
      }
      return;
    }

    if (msg.t === "USER_DISMISS") {
      if (pipeline) {
        // Arbiter dismissal handled in tick / dismiss
      }
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
chrome.runtime.onMessage.addListener((msg: any) => {
  if (msg?.target !== "offscreen") return;
  const m = msg as SwToOffscreen;
  if (!m || m.v !== 1) return;

  if (m.t === "OFFSCREEN_START") {
    void startInference(m.streamId, m.settings);
    return;
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

  const detectors = buildDetectors(settings);
  const arbiter = createArbiter();
  arbiter.setSensitivity(settings.sensitivity);

  pipeline = createPipeline(
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

  const assetBase = chrome.runtime.getURL("");
  await pipeline.start({ assetBase });

  // Subscribe to updates
  pipeline.onUpdate((update) => {
    const now = nowMs();

    // Trigger system notification if newly entering ALERT
    if (update.out.state === "ALERT" && lastAlertState !== "ALERT" && settings.notifications) {
      chrome.runtime.sendMessage({
        t: "TRIGGER_NOTIFICATION",
        reason: update.out.reasons.join("; ") || "Suspicious call detected.",
      }).catch(() => {});
    }
    lastAlertState = update.out.state;

    // Send challenge prompt immediately when entering CHALLENGE
    if (update.out.state === "CHALLENGE" && update.out.challenge) {
      currentPort?.postMessage({
        v: 1,
        t: "CHALLENGE",
        challenge: update.out.challenge,
        prompt: `Ask the caller to perform challenge: ${update.out.challenge.replaceAll("_", " ")}`,
        deadlineMs: update.out.challengeDeadlineMs ?? (now + 12000),
      } satisfies OffscreenToContent);
    }

    // Rate-limit general UPDATE messages to max 4 per second (250 ms)
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

  // Start audio capture
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      } as any,
      video: false,
    });

    // 1) Playback context: maintain audible audio for user
    playCtx = new AudioContext();
    const playSource = playCtx.createMediaStreamSource(mediaStream);
    playSource.connect(playCtx.destination);
    await playCtx.resume();

    // 2) Analysis context: 16 kHz resampled chunker worklet
    anaCtx = new AudioContext({ sampleRate: 16000 });
    await anaCtx.audioWorklet.addModule(chrome.runtime.getURL("audio-worklet.js"));
    const workletNode = new AudioWorkletNode(anaCtx, "chunker", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
    });
    workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      pipeline?.pushAudio(e.data, nowMs() - AUDIO_CHUNK_MS);
    };

    const anaSource = anaCtx.createMediaStreamSource(mediaStream);
    anaSource.connect(workletNode);
    await anaCtx.resume();
  } catch (err) {
    console.error("[offscreen] Failed to start audio stream capture:", err);
  }
}

function stopInference(): void {
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
  isFrameProcessing = false;
}
