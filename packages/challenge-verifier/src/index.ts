import { CHALLENGE_PROMPTS, type ChallengeStatus, type ChallengeType, type ChallengeVerifier, type FrameResult, type InitOptions } from "@sentinel/contracts";
import { evaluateCover } from "./cover";
import { evaluateFingers } from "./fingers";
import { evaluateHeadTurn } from "./head-turn";

interface Active { challenge: ChallengeType; startMs: number; frames: FrameResult[]; baseline: number }
const clamp = (x: number) => Math.max(0, Math.min(1, x));

export function createChallengeVerifier(): ChallengeVerifier {
  let history: FrameResult[] = [], active: Active | null = null, terminal: ChallengeStatus | null = null;
  const status = (state: ChallengeStatus["state"], artifactScore: number, evidence: string): ChallengeStatus => ({
    challenge: active!.challenge, state, artifactScore: clamp(artifactScore), evidence,
  });
  const update = (now: number) => {
    if (!active || terminal) return;
    const { challenge, frames, baseline, startMs } = active;
    if (challenge === "turn_head_left_right") {
      const r = evaluateHeadTurn(frames, baseline);
      if (r.passed) terminal = status("passed", r.artifactScore,
        `Yaw reached +${Math.round(r.pos)}° and ${Math.round(r.neg)}°; landmark quality was ${r.qBig.toFixed(2)} at large turns.`);
    } else if (challenge === "cover_half_face") {
      const r = evaluateCover(frames, baseline);
      if (r.passed) terminal = status("passed", r.artifactScore,
        `Face was covered for ${Math.round(r.durationMs)} ms and found again; artifact score ${r.artifactScore.toFixed(2)}.`);
    } else {
      const r = evaluateFingers(frames, baseline);
      if (r.passed) terminal = status("passed", r.artifactScore,
        `A hand stayed near the face for ${Math.round(r.durationMs)} ms; artifact score ${r.artifactScore.toFixed(2)}.`);
    }
    if (!terminal && now - startMs >= 12000) {
      const evidence = `Challenge was not completed: ${CHALLENGE_PROMPTS[challenge]}`;
      terminal = status("failed", 0, evidence);
    }
  };
  return {
    isMock: false,
    async init(_opts: InitOptions) {},
    start(challenge, tsMs) {
      terminal = null;
      const baselineFrames = history.filter((f) => tsMs - f.tsMs <= 2000 && Math.abs(f.headPose.yawDeg) < 10 && f.faceFound);
      const baseline = baselineFrames.length ? baselineFrames.reduce((s, f) => s + f.landmarkQuality, 0) / baselineFrames.length : 0.8;
      active = { challenge, startMs: tsMs, frames: [], baseline };
    },
    pushFrame(frame) {
      history.push(frame); history = history.filter((f) => frame.tsMs - f.tsMs <= 2000);
      if (active && !terminal && frame.tsMs >= active.startMs) { active.frames.push(frame); update(frame.tsMs); }
    },
    poll() {
      if (terminal) return terminal;
      if (!active) return null;
      const frame = active.frames[active.frames.length - 1];
      update(frame?.tsMs ?? active.startMs);
      return terminal ?? status("pending", 0, "Waiting for the requested action.");
    },
    cancel() { active = null; terminal = null; },
  };
}

export { evaluateCover } from "./cover";
export { evaluateFingers } from "./fingers";
export { evaluateHeadTurn } from "./head-turn";
