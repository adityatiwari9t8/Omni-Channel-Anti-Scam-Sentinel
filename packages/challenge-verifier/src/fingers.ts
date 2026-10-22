import type { FrameResult } from "@sentinel/contracts";
import { coverArtifact } from "./artifact";

export function evaluateFingers(frames: FrameResult[], baseline: number) {
  let start: number | null = null, longest = 0, nearby: FrameResult[] = [];
  for (const f of frames) {
    if (f.handNearFace) { if (start === null) start = f.tsMs; longest = Math.max(longest, f.tsMs - start); nearby.push(f); }
    else start = null;
  }
  return { passed: longest >= 1000, artifactScore: coverArtifact(nearby, baseline), durationMs: longest };
}
