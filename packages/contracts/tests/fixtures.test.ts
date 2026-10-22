import { describe, expect, it } from "vitest";
import {
  benignEmail, constantYawFrames, energySeries, matchingAperture, phishingEmail, rms, silenceChunks,
  syntheticSpeechChunks, unrelatedAperture, yawSweepFrames,
} from "../src/index";

/** Reference best-lag Pearson correlation at 10 Hz (lags of +/- 4 bins = +/- 400 ms). */
function bestLagCorr(a: number[], b: number[], maxLag = 4): number {
  let best = -1;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const x = a.slice(Math.max(0, lag), a.length + Math.min(0, lag));
    const y = b.slice(Math.max(0, -lag), b.length + Math.min(0, -lag));
    const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    if (sxx > 1e-12 && syy > 1e-12) best = Math.max(best, sxy / Math.sqrt(sxx * syy));
  }
  return best;
}

describe("fixtures", () => {
  it("speech has energy and silence has none", () => {
    expect(syntheticSpeechChunks(1).every((c) => c.length === 1600)).toBe(true);
    expect(Math.min(...energySeries(syntheticSpeechChunks(5)))).toBeGreaterThan(0.01);
    expect(Math.max(...energySeries(silenceChunks(5)))).toBe(0);
    expect(rms(new Float32Array(0))).toBe(0);
  });
  it("matching aperture correlates with the audio energy, unrelated does not", () => {
    const e = energySeries(syntheticSpeechChunks(10));
    expect(bestLagCorr(e, matchingAperture(10))).toBeGreaterThan(0.8);
    expect(bestLagCorr(e, unrelatedAperture(10))).toBeLessThan(0.3);
  });
  it("yaw sweep reaches both signs; constant yaw does not move", () => {
    const yaws = yawSweepFrames(0, 5).map((f) => f.headPose.yawDeg);
    expect(Math.max(...yaws)).toBeGreaterThan(30);
    expect(Math.min(...yaws)).toBeLessThan(-30);
    expect(new Set(constantYawFrames(0, 2).map((f) => f.headPose.yawDeg)).size).toBe(1);
  });
  it("sample emails exist", () => {
    expect(benignEmail.links).toEqual([]);
    expect(phishingEmail.links.length).toBe(1);
  });
});
