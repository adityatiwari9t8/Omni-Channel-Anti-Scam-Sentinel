import type { AudioResult, FrameResult, Ms, Score01, SyncResult } from "@sentinel/contracts";
import type { ArbiterConfig } from "./config";

export interface FusionState {
  lastSmoothed: Score01 | null;
  lastSmoothedTs: Ms | null;
}

export interface FusionOutput {
  rawScore: Score01 | null;
  smoothedScore: Score01 | null;
  reasons: string[];
}

// Inference can lag by a few seconds on CPU, but old scores must not remain
// authoritative when capture stops. Future timestamps are tolerated briefly
// for small clock/transfer skew between extension contexts.
const MAX_AUDIO_AGE_MS = 8_000;
const MAX_SYNC_AGE_MS = 4_000;
const MAX_FRAME_AGE_MS = 2_000;
const MAX_FUTURE_SKEW_MS = 5_000;
const isFresh = (ts: number, now: number, maxAge: number): boolean => {
  const age = now - ts;
  return Number.isFinite(ts) && age >= -MAX_FUTURE_SKEW_MS && age <= maxAge;
};
const isUnitScore = (x: number): boolean => Number.isFinite(x) && x >= 0 && x <= 1;

export function computeFusion(
  audio: AudioResult | null,
  sync: SyncResult | null,
  frame: FrameResult | null,
  cfg: ArbiterConfig,
  state: FusionState,
  nowMs: Ms,
): FusionOutput {
  let weightedSum = 0;
  let weightSum = 0;
  const reasons: string[] = [];

  // Audio component
  const audioFresh = Boolean(audio && isFresh(audio.windowEndMs, nowMs, MAX_AUDIO_AGE_MS));
  if (audio && !audioFresh) reasons.push("Audio signal is stale");
  if (audio && audioFresh && isUnitScore(audio.scoreFake) && isUnitScore(audio.confidence) && audio.confidence > 0) {
    const effW = cfg.wAudio * audio.confidence;
    weightedSum += effW * audio.scoreFake;
    weightSum += effW;
    if (audio.scoreFake >= 0.5) {
      reasons.push(`Voice score high (${audio.scoreFake.toFixed(2)})`);
    } else if (audio.scoreFake < 0.3) {
      reasons.push(`Voice natural (${audio.scoreFake.toFixed(2)})`);
    }
  }

  // Audio-visual sync component
  const syncFresh = Boolean(sync && isFresh(sync.tsMs, nowMs, MAX_SYNC_AGE_MS));
  if (sync && !syncFresh) reasons.push("Audio/video sync signal is stale");
  if (sync && syncFresh && isUnitScore(sync.scoreFake) && isUnitScore(sync.confidence) && sync.confidence > 0) {
    const effW = cfg.wSync * sync.confidence;
    weightedSum += effW * sync.scoreFake;
    weightSum += effW;
    if (sync.scoreFake >= 0.5) {
      reasons.push(`Lip-sync mismatch (${sync.scoreFake.toFixed(2)})`);
    } else if (sync.scoreFake < 0.3) {
      reasons.push(`Lip-sync correlated (${sync.scoreFake.toFixed(2)})`);
    }
  }

  // Experimental pretrained frame classifier. Confidence is a conservative fusion weight,
  // not a calibrated probability that the classification is correct.
  const frameFresh = Boolean(frame && isFresh(frame.tsMs, nowMs, MAX_FRAME_AGE_MS));
  if (frame && !frameFresh) reasons.push("Video signal is stale");
  if (frame && frameFresh && frame.deepfakeAvailable === false) reasons.push("Visual classifier unavailable");
  if (frame && frameFresh && isUnitScore(frame.deepfakeScore!) && isUnitScore(frame.deepfakeConfidence!) && frame.deepfakeConfidence! > 0) {
    const effW = cfg.wVision * frame.deepfakeConfidence!;
    weightedSum += effW * frame.deepfakeScore!;
    weightSum += effW;
    if (frame.deepfakeScore! >= 0.5) {
      reasons.push(`Visual classifier risk (${frame.deepfakeScore!.toFixed(2)})`);
    }
  }

  // Frame landmark quality / occlusion observations
  if (frame && frameFresh) {
    if (!frame.faceFound) {
      reasons.push("No face detected in video");
    } else if (frame.faceOccluded) {
      reasons.push("Caller face partially occluded");
    } else if (frame.landmarkQuality < 0.4) {
      reasons.push("Low facial landmark quality");
    }
  }

  if (weightSum < cfg.minEvidence) {
    return {
      rawScore: null,
      smoothedScore: null,
      reasons: reasons.length > 0 ? reasons : ["Not enough data"],
    };
  }

  const rawScore = Math.max(0, Math.min(1, weightedSum / weightSum));

  let smoothed = rawScore;
  if (state.lastSmoothed !== null && state.lastSmoothedTs !== null) {
    const dt = Math.max(0, nowMs - state.lastSmoothedTs);
    const alpha = 1 - Math.exp(-dt / Math.max(1, cfg.emaTauMs));
    smoothed = (1 - alpha) * state.lastSmoothed + alpha * rawScore;
    smoothed = Math.max(0, Math.min(1, smoothed));
  }

  state.lastSmoothed = smoothed;
  state.lastSmoothedTs = nowMs;

  return {
    rawScore,
    smoothedScore: smoothed,
    reasons: reasons.length > 0 ? reasons : ["Call signals nominal"],
  };
}
