import type {
  AudioDetector, AudioResult, ChallengeStatus, ChallengeType, ChallengeVerifier, EmailInput, FrameResult,
  InitOptions, Ms, SyncDetector, SyncResult, TextClassifier, TextResult, VisionDetector,
} from "@sentinel/contracts";
import { SAMPLE_RATE, rms } from "@sentinel/contracts";

/** Scripted fake-ness over time: low, ramp up, high, ramp down, low. */
export function scriptedScore(tRelMs: number): number {
  const t = tRelMs / 1000;
  if (t < 20) return 0.1;
  if (t < 30) return 0.1 + (0.7 * (t - 20)) / 10;
  if (t < 50) return 0.8;
  if (t < 60) return 0.8 - (0.7 * (t - 50)) / 10;
  return 0.1;
}

export function mockAudioDetector(): AudioDetector {
  const WINDOW_SAMPLES = 2 * SAMPLE_RATE;   // 2 s window and hop
  let n = 0, sumSq = 0, winStart: Ms | null = null, t0: Ms | null = null;
  return {
    isMock: true,
    async init(_o: InitOptions) {},
    async push(chunk, tsMs): Promise<AudioResult | null> {
      if (t0 === null) t0 = tsMs;
      if (winStart === null) winStart = tsMs;
      const r = rms(chunk);
      sumSq += r * r * chunk.length;
      n += chunk.length;
      if (n < WINDOW_SAMPLES) return null;
      const windowRms = Math.sqrt(sumSq / n);
      const end = winStart + (n * 1000) / SAMPLE_RATE;
      const res: AudioResult = {
        windowStartMs: winStart, windowEndMs: end,
        scoreFake: scriptedScore(end - t0), confidence: windowRms < 0.005 ? 0 : 0.9, latencyMs: 1,
      };
      n = 0; sumSq = 0; winStart = null;
      return res;
    },
    dispose() { n = 0; sumSq = 0; winStart = null; t0 = null; },
  };
}

export function mockVisionDetector(): VisionDetector {
  let t0: Ms | null = null;
  return {
    isMock: true,
    async init(_o: InitOptions) {},
    async processFrame(frame, tsMs): Promise<FrameResult> {
      if (t0 === null) t0 = tsMs;
      const blank = (frame as unknown as { __blank?: boolean })?.__blank === true;
      const t = (tsMs - t0) / 1000;
      if (blank) {
        return { tsMs, faceFound: false, mouthAperture: 0, headPose: { yawDeg: 0, pitchDeg: 0, rollDeg: 0 },
          faceOccluded: true, landmarkQuality: 0, handNearFace: false, latencyMs: 1 };
      }
      return {
        tsMs, faceFound: true, mouthAperture: 0.06 + 0.05 * (1 + Math.sin(2 * Math.PI * 2 * t)),
        headPose: { yawDeg: 3 * Math.sin(t), pitchDeg: 0, rollDeg: 0 },
        faceOccluded: false, landmarkQuality: 0.9, handNearFace: false, latencyMs: 1,
      };
    },
    dispose() { t0 = null; },
  };
}

export function mockSyncDetector(): SyncDetector {
  let first: Ms | null = null, last: Ms = 0;
  return {
    isMock: true,
    pushAudioEnergy(_rms, tsMs) { if (first === null) first = tsMs; last = tsMs; },
    pushFrame(_r) {},
    getSync(): SyncResult | null {
      if (first === null || last - first < 3000) return null;
      const score = scriptedScore(last - first - 3000);
      return { tsMs: last, scoreFake: score, confidence: 0.8, correlation: 0.6 - 0.5 * score, windowMs: 8000 };
    },
    reset() { first = null; last = 0; },
  };
}

export function mockChallengeVerifier(): ChallengeVerifier {
  let active: { c: ChallengeType; start: Ms; now: Ms } | null = null, t0: Ms | null = null;
  return {
    isMock: true,
    async init(_o: InitOptions) {},
    start(c, tsMs) { active = { c, start: tsMs, now: tsMs }; if (t0 === null) t0 = tsMs; },
    pushFrame(r) { if (active) active.now = r.tsMs; },
    poll(): ChallengeStatus | null {
      if (!active) return null;
      const high = scriptedScore(active.start - (t0 ?? active.start)) > 0.5;
      if (active.now - active.start < 4000) return { challenge: active.c, state: "pending", artifactScore: 0, evidence: "Mock: waiting" };
      return high
        ? { challenge: active.c, state: "failed", artifactScore: 0.8, evidence: "Mock: face broke down during the challenge" }
        : { challenge: active.c, state: "passed", artifactScore: 0.1, evidence: "Mock: challenge completed cleanly" };
    },
    cancel() { active = null; },
  };
}

export function mockTextClassifier(): TextClassifier {
  return {
    isMock: true,
    async init(_o: InitOptions) {},
    async classify(e: EmailInput): Promise<TextResult> {
      const text = `${e.subject} ${e.bodyText}`.toLowerCase();
      const hit = text.includes("urgent") || text.includes("verify");
      return hit
        ? { risk: 0.85, label: "phishing", reasons: ["Mock: urgent or verify wording"], latencyMs: 1 }
        : { risk: 0.05, label: "safe", reasons: [], latencyMs: 1 };
    },
  };
}
