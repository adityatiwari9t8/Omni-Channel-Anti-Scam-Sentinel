import type { Sensitivity } from "@sentinel/contracts";

export interface ThresholdSet {
  suspicious: number;
  challenge: number;
  alert: number;
}

export interface ArbiterConfig {
  wAudio: number;
  wSync: number;
  minEvidence: number;
  emaTauMs: number;
  thresholds: Record<Sensitivity, ThresholdSet>;
  hysteresis: number;
  suspiciousDwellMs: number;
  challengeDwellMs: number;
  challengeTimeoutMs: number;
  alertDwellMs: number;
  dismissCooldownMs: number;
  artifactAlertThreshold: number;
}

export const DEFAULT_ARBITER_CONFIG: ArbiterConfig = {
  wAudio: 0.5,
  wSync: 0.5,
  minEvidence: 0.2,
  emaTauMs: 4000,
  thresholds: {
    medium: { suspicious: 0.5, challenge: 0.65, alert: 0.8 },
    low: { suspicious: 0.6, challenge: 0.75, alert: 0.9 },
    high: { suspicious: 0.4, challenge: 0.55, alert: 0.7 },
  },
  hysteresis: 0.1,
  suspiciousDwellMs: 3000,
  challengeDwellMs: 5000,
  challengeTimeoutMs: 12000,
  alertDwellMs: 3000,
  dismissCooldownMs: 60000,
  artifactAlertThreshold: 0.6,
};
