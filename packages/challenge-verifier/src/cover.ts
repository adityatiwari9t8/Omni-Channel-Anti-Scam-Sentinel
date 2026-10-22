import type { FrameResult } from "@sentinel/contracts";
import { coverArtifact } from "./artifact";

export function evaluateCover(frames: FrameResult[], baseline: number) {
  let start: number | null = null, longest = 0, current: FrameResult[] = [], best: FrameResult[] = [], recovered = false;
  const boundaryJumps: number[] = [];
  for (const f of frames) {
    const covered = f.faceOccluded;
    if (covered) {
      if (start === null) { start = f.tsMs; current = []; }
      current.push(f); longest = Math.max(longest, f.tsMs - start);
      if (current.length > best.length) best = [...current];
    } else if (start !== null) {
      if (f.faceFound && longest >= 800) recovered = true;
      start = null; current = [];
    }
  }
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].faceOccluded !== frames[i - 1].faceOccluded) boundaryJumps.push(Math.abs(frames[i].landmarkQuality - frames[i - 1].landmarkQuality));
  }
  const artifactScore = coverArtifact(best, baseline, boundaryJumps);
  return { passed: recovered, artifactScore, durationMs: longest, recovered };
}
