import {
  type ContentToOffscreen,
  type OffscreenToContent,
  PORT_MEET,
  type SwToContent,
} from "@sentinel/contracts";
import { ZOOM_CONFIG } from "./zoom-config";
import { SentinelOverlay } from "./overlay";
import { nowMs } from "../shared/clock";
import { bytesToB64 } from "../shared/b64";

let port: chrome.runtime.Port | null = null;
let overlay: SentinelOverlay | null = null;
let captureInterval: number | null = null;
let isFrameInFlight = false;

function findZoomVideo(): HTMLVideoElement | HTMLCanvasElement | null {
  const elements = Array.from(
    document.querySelectorAll<HTMLVideoElement | HTMLCanvasElement>(ZOOM_CONFIG.videoSelector),
  );
  let best: HTMLVideoElement | HTMLCanvasElement | null = null;
  let maxArea = 0;

  for (const el of elements) {
    let w = 0;
    let h = 0;
    if (el instanceof HTMLVideoElement) {
      if (el.paused || el.ended || !el.videoWidth) continue;
      w = el.videoWidth;
      h = el.videoHeight;
    } else if (el instanceof HTMLCanvasElement) {
      w = el.width;
      h = el.height;
    }

    if (!w || !h) continue;

    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > maxArea) {
      maxArea = area;
      best = el;
    }
  }

  return best;
}

async function captureAndSendZoomFrame() {
  if (isFrameInFlight || !port) return;

  const target = findZoomVideo();
  if (!target) {
    port.postMessage({ v: 1, t: "VIDEO_LOST" } satisfies ContentToOffscreen);
    return;
  }

  isFrameInFlight = true;
  try {
    let srcW = 0;
    let srcH = 0;
    if (target instanceof HTMLVideoElement) {
      srcW = target.videoWidth;
      srcH = target.videoHeight;
    } else {
      srcW = target.width;
      srcH = target.height;
    }

    const w = Math.min(ZOOM_CONFIG.frameMaxWidth, srcW);
    const h = Math.round((srcH / srcW) * w);

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(target, 0, 0, w, h);
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: ZOOM_CONFIG.jpegQuality,
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
    console.error("[sentinel-zoom] Frame encode failed:", err);
  } finally {
    isFrameInFlight = false;
  }
}

function startZoomShield() {
  stopZoomShield();

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
    stopZoomShield();
  });

  const intervalMs = Math.round(1000 / ZOOM_CONFIG.frameFps);
  captureInterval = window.setInterval(() => {
    void captureAndSendZoomFrame();
  }, intervalMs);
}

function stopZoomShield() {
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
  isFrameInFlight = false;
}

// Background service worker command listener
chrome.runtime.onMessage.addListener((msg: any) => {
  const m = msg as SwToContent;
  if (!m || m.v !== 1) return;

  if (m.t === "MEET_START") {
    startZoomShield();
    return;
  }

  if (m.t === "MEET_STOP") {
    stopZoomShield();
    return;
  }
});
