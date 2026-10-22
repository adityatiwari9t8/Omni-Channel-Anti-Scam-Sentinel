import type { FrameResult } from "@sentinel/contracts";
import { coverArtifact } from "./artifact";

export function evaluateFingers(frames: FrameResult[], baseline: number) {
  let start: number | null = null, previousTs: number | null = null, runFrames = 0;
  let longest = 0, bestRunFrames = 0;
  const nearby: FrameResult[] = [];
  for (const f of frames) {
    if (previousTs !== null && f.tsMs - previousTs > 500) { start = null; runFrames = 0; }
    if (f.handNearFace && (f.raisedFingers ?? 0) >= 3) {
      if (start === null) { start = f.tsMs; runFrames = 0; }
      runFrames++;
      const duration = f.tsMs - start;
      if (duration > longest) { longest = duration; bestRunFrames = runFrames; }
      else if (duration === longest) bestRunFrames = Math.max(bestRunFrames, runFrames);
      nearby.push(f);
    } else { start = null; runFrames = 0; }
    previousTs = f.tsMs;
  }
  return { passed: longest >= 800 && bestRunFrames >= 6, artifactScore: coverArtifact(nearby, baseline), durationMs: longest };
}
