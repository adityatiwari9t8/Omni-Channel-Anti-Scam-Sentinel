import { describe, expect, it } from "vitest";
import { energySeries, makeFrame, matchingAperture, syntheticSpeechChunks, unrelatedAperture } from "@sentinel/contracts";
import { bestLagCorrelation, pearson } from "../src/correlate";
import { createSyncDetector } from "../src/window";

function feed(aperture: number[], offset = 0) {
  const detector = createSyncDetector(), energy = energySeries(syntheticSpeechChunks(10));
  const t0 = 10000;
  energy.forEach((e, i) => detector.pushAudioEnergy(e, t0 + i * 100));
  aperture.forEach((a, i) => detector.pushFrame(makeFrame(t0 + i * 100 + offset, { mouthAperture: a })));
  return detector;
}

describe("SyncDetector", () => {
  it("scores correlated signals low and unrelated motion high", () => {
    const good = feed(matchingAperture(10)).getSync()!;
    const bad = feed(unrelatedAperture(10)).getSync()!;
    expect(good.scoreFake).toBeLessThan(0.4);
    expect(good.confidence).toBeGreaterThan(0.5);
    expect(bad.scoreFake).toBeGreaterThan(0.6);
  });
  it("returns null until three seconds of speech and on silent windows", () => {
    const d = createSyncDetector();
    for (let i = 0; i < 20; i++) { d.pushAudioEnergy(0.2, i * 100); d.pushFrame(makeFrame(i * 100)); }
    expect(d.getSync()).toBeNull();
    for (let i = 20; i < 80; i++) { d.pushAudioEnergy(0, i * 100); d.pushFrame(makeFrame(i * 100)); }
    expect(d.getSync()).toBeNull();
  });
  it("absorbs 300 ms lag and reset clears the result", () => {
    const d = feed(matchingAperture(10), 300);
    expect(d.getSync()?.scoreFake).toBeLessThan(0.4);
    d.reset(); expect(d.getSync()).toBeNull();
  });
  it("computes Pearson correlation safely", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(bestLagCorrelation([1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6])).toBeGreaterThan(0.99);
    expect(pearson([1, 1], [2, 2])).toBeNull();
  });
});
