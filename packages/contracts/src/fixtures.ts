import type { EmailInput, FrameResult, Ms } from "./types";
import { AUDIO_CHUNK_MS, SAMPLE_RATE } from "./types";
import { rms } from "./util";

export const CHUNK_SAMPLES = (SAMPLE_RATE * AUDIO_CHUNK_MS) / 1000; // 1600

/** Deterministic pseudo-random numbers in [0, 1) (mulberry32). */
export function rng(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Loudness envelope of the synthetic "speech", always between 0 and 1. */
export function speechEnvelope(tSec: number): number {
  return 0.5 + 0.3 * Math.sin(2 * Math.PI * 2.3 * tSec) + 0.2 * Math.sin(2 * Math.PI * 0.7 * tSec + 0.5);
}

/** Speech-like test audio: low-passed noise with a varying loudness envelope. 100 ms chunks, 16 kHz mono. */
export function syntheticSpeechChunks(seconds: number, seed = 1): Float32Array[] {
  const r = rng(seed);
  const n = Math.round((seconds * 1000) / AUDIO_CHUNK_MS);
  const chunks: Float32Array[] = [];
  let lp = 0;
  let sample = 0;
  for (let c = 0; c < n; c++) {
    const ch = new Float32Array(CHUNK_SAMPLES);
    for (let i = 0; i < CHUNK_SAMPLES; i++, sample++) {
      lp = 0.8 * lp + 0.2 * (r() * 2 - 1);
      ch[i] = speechEnvelope(sample / SAMPLE_RATE) * lp * 1.5;
    }
    chunks.push(ch);
  }
  return chunks;
}

export function silenceChunks(seconds: number): Float32Array[] {
  const n = Math.round((seconds * 1000) / AUDIO_CHUNK_MS);
  return Array.from({ length: n }, () => new Float32Array(CHUNK_SAMPLES));
}

/** One RMS value per 100 ms chunk (what the pipeline gives SyncDetector.pushAudioEnergy). */
export const energySeries = (chunks: Float32Array[]): number[] => chunks.map(rms);

/** Mouth aperture (one value per 100 ms) that follows the loudness envelope of syntheticSpeechChunks. */
export function matchingAperture(seconds: number, seed = 3): number[] {
  const r = rng(seed);
  const n = Math.round((seconds * 1000) / AUDIO_CHUNK_MS);
  return Array.from({ length: n }, (_, i) => 0.03 + 0.25 * speechEnvelope((i * AUDIO_CHUNK_MS) / 1000 + 0.05) + 0.01 * (r() - 0.5));
}

/** Mouth aperture that has nothing to do with the audio (smooth random walk). */
export function unrelatedAperture(seconds: number, seed = 11): number[] {
  const r = rng(seed);
  const n = Math.round((seconds * 1000) / AUDIO_CHUNK_MS);
  let a = 0.15;
  return Array.from({ length: n }, () => {
    a = Math.min(0.3, Math.max(0.02, 0.92 * a + 0.08 * (0.02 + 0.28 * r())));
    return a;
  });
}

export function makeFrame(tsMs: Ms, o: Partial<FrameResult> = {}): FrameResult {
  return {
    tsMs, faceFound: true, mouthAperture: 0.1,
    headPose: { yawDeg: 0, pitchDeg: 0, rollDeg: 0 },
    faceOccluded: false, landmarkQuality: 0.9, handNearFace: false, latencyMs: 5, ...o,
  };
}

/** Frames (default 10 per second) where yaw sweeps 0 -> +max -> 0 -> -max -> 0 over `seconds`. */
export function yawSweepFrames(startMs: Ms, seconds = 5, fps = 10, maxYaw = 35, collapseAtLargeYaw = false): FrameResult[] {
  const n = Math.round(seconds * fps);
  return Array.from({ length: n }, (_, i) => {
    const t = i / fps;
    const yaw = maxYaw * Math.sin((2 * Math.PI * t) / seconds);
    const big = Math.abs(yaw) >= 20;
    return makeFrame(startMs + i * (1000 / fps), {
      headPose: { yawDeg: yaw, pitchDeg: 0, rollDeg: 0 },
      landmarkQuality: collapseAtLargeYaw && big ? 0.2 : 0.9,
    });
  });
}

/** Frames with a constant head pose (the caller ignores the challenge). */
export function constantYawFrames(startMs: Ms, seconds = 13, fps = 10, yawDeg = 0): FrameResult[] {
  const n = Math.round(seconds * fps);
  return Array.from({ length: n }, (_, i) =>
    makeFrame(startMs + i * (1000 / fps), { headPose: { yawDeg, pitchDeg: 0, rollDeg: 0 } }));
}

export const benignEmail: EmailInput = {
  subject: "Team lunch on Friday",
  bodyText: "Hi all, we are going to the new place near the office on Friday at 1 pm. Let me know if you have any dietary needs. Thanks, Priya",
  links: [],
  senderName: "Priya Sharma",
  senderAddress: "priya.sharma@examplecorp.com",
};

export const phishingEmail: EmailInput = {
  subject: "URGENT: Your account will be closed within 24 hours",
  bodyText: "Dear customer, we detected unusual activity. You must verify your password and card details immediately or your account will be closed. Click the link below to confirm your login.",
  links: [{ text: "https://www.paypal.com/verify", href: "http://paypa1-secure-login.xyz/verify" }],
  senderName: "PayPal Support",
  senderAddress: "support@paypa1-secure-login.xyz",
  replyTo: "helpdesk@mail-gmx.example",
};
