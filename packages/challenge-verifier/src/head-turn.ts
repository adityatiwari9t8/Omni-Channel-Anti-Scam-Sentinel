import type { FrameResult } from "@sentinel/contracts";
import { mean, yawArtifact } from "./artifact";

export function evaluateHeadTurn(frames: FrameResult[], baseline: number) {
  const found = frames.filter((f) => f.faceFound);
  const pos = Math.max(-Infinity, ...found.map((f) => f.headPose.yawDeg));
  const neg = Math.min(Infinity, ...found.map((f) => f.headPose.yawDeg));
  const ratio = frames.length ? found.length / frames.length : 0;
  const passed = pos >= 25 && neg <= -25 && ratio >= 0.7;
  const artifactScore = yawArtifact(frames, baseline);
  const qBig = mean(found.filter((f) => Math.abs(f.headPose.yawDeg) >= 20).map((f) => f.landmarkQuality));
  return { passed, pos, neg, ratio, qBig, artifactScore };
}
