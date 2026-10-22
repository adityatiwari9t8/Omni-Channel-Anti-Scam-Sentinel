import type { FrameResult } from "@sentinel/contracts";

export const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

export function yawArtifact(frames: FrameResult[], baseline: number): number {
  const large = frames.filter((f) => Math.abs(f.headPose.yawDeg) >= 20 && f.faceFound);
  if (!large.length) return 0;
  const qBig = mean(large.map((f) => f.landmarkQuality));
  const qualityDrop = clamp((baseline - qBig) / 0.4);
  let jump = 0;
  for (let i = 1; i < large.length; i++) jump = Math.max(jump, Math.abs(large[i].mouthAperture - large[i - 1].mouthAperture));
  const discontinuity = clamp((jump - 0.12) / 0.25);
  return Math.max(qualityDrop, discontinuity);
}

export function coverArtifact(occluded: FrameResult[], baseline: number, boundaryJumps: number[] = []): number {
  if (!occluded.length) return 0;
  const qualityStaysHigh = mean(occluded.map((f) => f.landmarkQuality)) > 0.8 ? 1 : 0;
  let edgeJitter = boundaryJumps.reduce((max, delta) => Math.max(max, clamp((delta - Math.max(0.1, baseline * 0.2)) / 0.35)), 0);
  for (let i = 1; i < occluded.length; i++) {
    const delta = Math.abs(occluded[i].landmarkQuality - occluded[i - 1].landmarkQuality);
    edgeJitter = Math.max(edgeJitter, clamp((delta - Math.max(0.1, baseline * 0.2)) / 0.35));
  }
  return Math.max(qualityStaysHigh, edgeJitter);
}
