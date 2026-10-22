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
  if (audio && Number.isFinite(audio.scoreFake) && Number.isFinite(audio.confidence) && audio.confidence > 0) {
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
  if (sync && Number.isFinite(sync.scoreFake) && Number.isFinite(sync.confidence) && sync.confidence > 0) {
    const effW = cfg.wSync * sync.confidence;
    weightedSum += effW * sync.scoreFake;
    weightSum += effW;
    if (sync.scoreFake >= 0.5) {
      reasons.push(`Lip-sync mismatch (${sync.scoreFake.toFixed(2)})`);
    } else if (sync.scoreFake < 0.3) {
      reasons.push(`Lip-sync correlated (${sync.scoreFake.toFixed(2)})`);
    }
  }

  // Frame landmark quality / occlusion observations
  if (frame) {
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
