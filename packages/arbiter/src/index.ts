import type {
  ArbiterOutput,
  AudioResult,
  ChallengeStatus,
  FrameResult,
  Ms,
  Sensitivity,
  SyncResult,
} from "@sentinel/contracts";
import { type ArbiterConfig, DEFAULT_ARBITER_CONFIG } from "./config";
import { computeFusion, type FusionState } from "./fusion";
import { ArbiterStateMachine } from "./state";

export * from "./config";
export * from "./fusion";
export * from "./state";

export interface Arbiter {
  onAudio(result: AudioResult): void;
  onFrame(result: FrameResult): void;
  onSync(result: SyncResult | null): void;
  onChallenge(status: ChallengeStatus | null): void;
  tick(nowMs: Ms): ArbiterOutput;
  dismiss(nowMs?: Ms): void;
  setSensitivity(s: Sensitivity): void;
  reset(): void;
  getConfig(): ArbiterConfig;
}

export function createArbiter(cfg?: Partial<ArbiterConfig>): Arbiter {
  const fullConfig: ArbiterConfig = { ...DEFAULT_ARBITER_CONFIG, ...cfg };
  let sensitivity: Sensitivity = "medium";

  let latestAudio: AudioResult | null = null;
  let latestFrame: FrameResult | null = null;
  let latestSync: SyncResult | null = null;
  let latestChallenge: ChallengeStatus | null = null;

  const fusionState: FusionState = {
    lastSmoothed: null,
    lastSmoothedTs: null,
  };

  const sm = new ArbiterStateMachine(fullConfig, sensitivity);

  return {
    onAudio(result: AudioResult) {
      latestAudio = result;
    },
    onFrame(result: FrameResult) {
      latestFrame = result;
    },
    onSync(result: SyncResult | null) {
      latestSync = result;
    },
    onChallenge(status: ChallengeStatus | null) {
      latestChallenge = status;
    },
    tick(nowMs: Ms): ArbiterOutput {
      const fusion = computeFusion(latestAudio, latestSync, latestFrame, fullConfig, fusionState, nowMs);
      return sm.update(fusion.smoothedScore, latestChallenge, nowMs, fusion.reasons);
    },
    dismiss(nowMs?: Ms) {
      const t = nowMs ?? (performance.timeOrigin + performance.now());
      sm.dismiss(t);
    },
    setSensitivity(s: Sensitivity) {
      sensitivity = s;
      sm.setSensitivity(s);
    },
    reset() {
      latestAudio = null;
      latestFrame = null;
      latestSync = null;
      latestChallenge = null;
      fusionState.lastSmoothed = null;
      fusionState.lastSmoothedTs = null;
      sm.reset();
    },
    getConfig(): ArbiterConfig {
      return fullConfig;
    },
  };
}
