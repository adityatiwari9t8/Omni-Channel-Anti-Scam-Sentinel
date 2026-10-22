import {
  type ContentToOffscreen,
  type OffscreenToContent,
  PORT_MEET,
  type SwToContent,
} from "@sentinel/contracts";
import { MEET_CONFIG } from "./meet-config";
import { SentinelOverlay } from "./overlay";
import { nowMs } from "../shared/clock";
import { bytesToB64 } from "../shared/b64";

let port: chrome.runtime.Port | null = null;
let overlay: SentinelOverlay | null = null;
let captureInterval: number | null = null;
let isFrameInFlight = false;
let selectedVideo: HTMLVideoElement | null = null;

function findRemoteVideo(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>(MEET_CONFIG.videoSelector));
  let bestVideo: HTMLVideoElement | null = null;
  let maxArea = 0;

  for (const v of videos) {
    if (!v.videoWidth || !v.videoHeight || v.paused || v.ended) continue;

    // Check if mirrored (self-view is usually mirrored via transform matrix(-1, ...))
    const style = window.getComputedStyle(v);
    const transform = style.transform || "";
    if (transform.includes("matrix(-1") || transform.includes("scaleX(-1)")) {
      continue; // Skip mirrored self-view
    }

    const rect = v.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > maxArea) {
      maxArea = area;
      bestVideo = v;
    }
  }

  return bestVideo;
}

async function captureAndSendFrame() {
  if (isFrameInFlight || !port) return;

  const video = selectedVideo ?? findRemoteVideo();
  if (!video || !video.videoWidth) {
    port.postMessage({ v: 1, t: "VIDEO_LOST" } satisfies ContentToOffscreen);
    return;
  }

  isFrameInFlight = true;
  try {
    const w = Math.min(MEET_CONFIG.frameMaxWidth, video.videoWidth);
    const h = Math.round((video.videoHeight / video.videoWidth) * w);

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: MEET_CONFIG.jpegQuality,
    });
    const buffer = await blob.arrayBuffer();
    const jpegB64 = bytesToB64(new Uint8Array(buffer));

    port.postMessage({
      v: 1,
      t: "FRAME",
      jpegB64,
      w,
      h,
      tsMs: nowMs(),
    } satisfies ContentToOffscreen);
  } catch (err) {
    console.error("[sentinel-meet] Frame encode failed:", err);
  } finally {
    isFrameInFlight = false;
  }
}

function startMeetingShield() {
  stopMeetingShield();

  port = chrome.runtime.connect({ name: PORT_MEET });
  port.postMessage({ v: 1, t: "HELLO" } satisfies ContentToOffscreen);

  overlay = new SentinelOverlay(() => {
    port?.postMessage({ v: 1, t: "USER_DISMISS" } satisfies ContentToOffscreen);
  });

  port.onMessage.addListener((msg: OffscreenToContent) => {
    if (!msg || msg.v !== 1) return;

    if (msg.t === "UPDATE") {
      overlay?.update(msg.out);
      return;
    }

    if (msg.t === "CHALLENGE") {
      overlay?.showChallenge(msg.challenge, msg.prompt, msg.deadlineMs);
      return;
    }
  });

  port.onDisconnect.addListener(() => {
    stopMeetingShield();
  });

  // Capture loop at frameFps (~10 fps = 100ms)
  const intervalMs = Math.round(1000 / MEET_CONFIG.frameFps);
  captureInterval = window.setInterval(() => {
    void captureAndSendFrame();
  }, intervalMs);
}

function stopMeetingShield() {
  if (captureInterval !== null) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  if (overlay) {
    overlay.destroy();
    overlay = null;
  }
  if (port) {
    port.disconnect();
    port = null;
  }
  selectedVideo = null;
  isFrameInFlight = false;
}

// Listen for messages from background service worker
chrome.runtime.onMessage.addListener((msg: any) => {
  const m = msg as SwToContent;
  if (!m || m.v !== 1) return;

  if (m.t === "MEET_START") {
    startMeetingShield();
    return;
  }

  if (m.t === "MEET_STOP") {
    stopMeetingShield();
    return;
  }
});
