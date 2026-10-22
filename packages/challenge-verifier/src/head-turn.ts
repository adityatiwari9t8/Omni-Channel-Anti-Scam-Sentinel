import type { FrameResult } from "@sentinel/contracts";
import { mean, yawArtifact } from "./artifact";

export function evaluateHeadTurn(frames: FrameResult[], baseline: number) {
  const found = frames.filter((f) => f.faceFound);
  const pos = Math.max(-Infinity, ...found.map((f) => f.headPose.yawDeg));
  const neg = Math.min(Infinity, ...found.map((f) => f.headPose.yawDeg));
  const ratio = frames.length ? found.length / frames.length : 0;
  const hasSustainedTurn = (direction: "left" | "right") => {
    let start: number | null = null, previous: number | null = null, count = 0;
    for (const f of frames) {
      if (previous !== null && f.tsMs - previous > 500) { start = null; count = 0; }
      const matches = f.faceFound && (direction === "right" ? f.headPose.yawDeg >= 25 : f.headPose.yawDeg <= -25);
      if (matches) {
        if (start === null) { start = f.tsMs; count = 0; }
        count++;
        if (count >= 3 && f.tsMs - start >= 150) return true;
      } else { start = null; count = 0; }
      previous = f.tsMs;
    }
    return false;
  };
  const passed = hasSustainedTurn("right") && hasSustainedTurn("left") && ratio >= 0.7;
  const artifactScore = yawArtifact(frames, baseline);
  const qBig = mean(found.filter((f) => Math.abs(f.headPose.yawDeg) >= 20).map((f) => f.landmarkQuality));
  return { passed, pos, neg, ratio, qBig, artifactScore };
}
