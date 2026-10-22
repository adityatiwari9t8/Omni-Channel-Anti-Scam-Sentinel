import { describe, expect, it, vi } from "vitest";
import { AudioDetectorImpl } from "../src/detector";
import { gateWindow } from "../src/gate";
import { parseAudioModelMeta } from "../src/meta";
import { scoreOutput } from "../src/score";
import { AudioWindowing } from "../src/windowing";

const meta = { id: "test", sampleRate: 16000 as const, windowSamples: 32000, hopSamples: 16000, inputName: "input", outputName: "output", outputKind: "sigmoid1" as const, fakeIndex: 0, features: "raw" as const, normalize: "none" as const, silenceRmsThreshold: 0.005, thresholdFake: 0.5, license: "test", source: "test" };
const audioChunk = (value = 0.1) => new Float32Array(1600).fill(value);

describe("audio metadata", () => {
  it("accepts valid metadata and rejects invalid fields clearly", () => {
    expect(parseAudioModelMeta(meta)).toEqual(meta);
    expect(() => parseAudioModelMeta({ ...meta, sampleRate: 8000 })).toThrow("sampleRate");
    expect(() => parseAudioModelMeta({ ...meta, outputKind: "unknown" })).toThrow("outputKind");
  });
});

describe("audio windowing", () => {
  it("emits one window per hop with sample-accurate timestamps", () => {
    const w = new AudioWindowing(32000, 16000); const emitted = [];
    for (let i = 0; i < 40; i++) { const result = w.push(audioChunk(), 1000 + i * 100); if (result) emitted.push(result); }
    expect(emitted).toHaveLength(3);
    expect(emitted[0]).toMatchObject({ windowStartMs: 1000, windowEndMs: 3000 });
    expect(emitted[1]).toMatchObject({ windowStartMs: 2000, windowEndMs: 4000 });
  });
  it("resets after a timestamp gap over 250 ms", () => {
    const w = new AudioWindowing(32000, 16000);
    for (let i = 0; i < 19; i++) expect(w.push(audioChunk(), i * 100)).toBeNull();
    expect(w.push(audioChunk(), 3000)).toBeNull();
    for (let i = 1; i < 19; i++) expect(w.push(audioChunk(), 3000 + i * 100)).toBeNull();
    expect(w.push(audioChunk(), 4900)?.windowStartMs).toBe(3000);
  });
});

describe("audio gate and score", () => {
  it("gives silence zero speech and no usable gate", () => {
    expect(gateWindow(new Float32Array(32000), 0.005)).toMatchObject({ speechRatio: 0, usable: false });
  });
  it("converts all output kinds and handles NaN", () => {
    const base = { fakeIndex: 1, thresholdFake: 0.5 };
    expect(scoreOutput([0, 2], { ...base, outputKind: "logits2" }).scoreFake).toBeGreaterThan(0.8);
    expect(scoreOutput([2], { ...base, outputKind: "logit1" }).scoreFake).toBeGreaterThan(0.8);
    expect(scoreOutput([0.8], { ...base, outputKind: "sigmoid1" }).scoreFake).toBe(0.8);
    expect(scoreOutput([0.2], { ...base, outputKind: "score1_bonafide" }).scoreFake).toBeCloseTo(0.8);
    expect(scoreOutput([Number.NaN], { ...base, outputKind: "sigmoid1" })).toEqual({ scoreFake: 0, confidence: 0 });
  });
  it("has confidence that increases with distance from threshold and is zero without speech", () => {
    const args = { fakeIndex: 0, thresholdFake: 0.5, outputKind: "sigmoid1" as const };
    expect(scoreOutput([0.9], args, 0.6).confidence).toBeGreaterThan(scoreOutput([0.6], args, 0.6).confidence);
    expect(scoreOutput([0.9], args, 0).confidence).toBe(0);
  });
  it("does not call the model for silence and dispose is idempotent", async () => {
    const run = vi.fn(async () => ({ output: { data: new Float32Array([0.7]) } }));
    const detector = new AudioDetectorImpl(async () => ({ session: { run }, backend: "wasm" }), async () => meta);
    await detector.init({ assetBase: "/" });
    let result: import("@sentinel/contracts").AudioResult | null = null;
    for (let i = 0; i < 20; i++) result = await detector.push(new Float32Array(1600), i * 100);
    expect(result?.confidence).toBe(0); expect(run).not.toHaveBeenCalled();
    detector.dispose(); detector.dispose();
  });
  it("drops a stale pending window when inference is busy and keeps the newest", async () => {
    let releaseFirst!: (value: { output: { data: Float32Array } }) => void;
    const firstInference = new Promise<{ output: { data: Float32Array } }>((resolve) => { releaseFirst = resolve; });
    const run = vi.fn().mockImplementationOnce(() => firstInference).mockResolvedValue({ output: { data: new Float32Array([0.8]) } });
    const detector = new AudioDetectorImpl(async () => ({ session: { run }, backend: "wasm" }), async () => meta);
    await detector.init({ assetBase: "/" });
    for (let i = 0; i < 19; i++) await detector.push(audioChunk(), i * 100);
    const first = detector.push(audioChunk(), 1900);
    await Promise.resolve();
    let stale: Promise<import("@sentinel/contracts").AudioResult | null> | null = null;
    for (let i = 20; i < 30; i++) {
      const pushed = detector.push(audioChunk(), i * 100);
      if (i === 29) stale = pushed;
    }
    let newest: Promise<import("@sentinel/contracts").AudioResult | null> | null = null;
    for (let i = 30; i < 40; i++) {
      const pushed = detector.push(audioChunk(), i * 100);
      if (i === 39) newest = pushed;
    }
    expect(detector.dropped).toBe(1);
    releaseFirst({ output: { data: new Float32Array([0.7]) } });
    expect((await first)?.scoreFake).toBeCloseTo(0.7);
    expect(await stale).toBeNull();
    expect((await newest)?.scoreFake).toBeCloseTo(0.8);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
