import type {
  AudioDetector, ChallengeVerifier, EmailInput, SyncDetector, TextClassifier, VisionDetector,
} from "./types";
import { AUDIO_CHUNK_MS } from "./types";
import {
  benignEmail, constantYawFrames, energySeries, makeFrame, matchingAperture, phishingEmail,
  silenceChunks, syntheticSpeechChunks, unrelatedAperture, yawSweepFrames,
} from "./fixtures";
import { nowMs } from "./util";

export interface SelfTestDeps {
  audio: AudioDetector;
  vision: VisionDetector;
  sync: SyncDetector;
  challenge: ChallengeVerifier;
  text: TextClassifier;
}
export interface SelfTestEnv {
  assetBase: string;
  /** A real face photo (from the vision package assets). Mocks ignore it. */
  loadTestFace(): Promise<ImageBitmap>;
  /** A black frame, for example 320x180. */
  loadBlankFrame(): Promise<ImageBitmap>;
}
export interface CheckResult { module: string; name: string; ok: boolean; detail: string; ms: number }

const in01 = (x: unknown): boolean => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
const median = (a: number[]): number => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} took longer than ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
async function check(out: CheckResult[], module: string, name: string, fn: () => Promise<string | void>) {
  const t0 = performance.now();
  try {
    const detail = (await fn()) ?? "ok";
    out.push({ module, name, ok: true, detail, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    out.push({ module, name, ok: false, detail: String((e as Error)?.message ?? e), ms: Math.round(performance.now() - t0) });
  }
}

/** Runs every module through the same checks. A module that throws never stops the others. */
export async function runContractSelfTest(d: SelfTestDeps, env: SelfTestEnv): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const init = { assetBase: env.assetBase };

  // ---------------- audio ----------------
  await check(out, "audio", "init within 30 s", async () => { await withTimeout(d.audio.init(init), 30000, "audio.init"); });
  await check(out, "audio", "scores in range on 12 s of synthetic speech", async () => {
    const chunks = syntheticSpeechChunks(12);
    const t0 = nowMs();
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      const r = await d.audio.push(chunks[i], t0 + i * AUDIO_CHUNK_MS);
      if (r) results.push(r);
    }
    assert(results.length >= 1, "no result after 12 s of audio (window longer than 12 s, or push never returns a result)");
    for (const r of results) {
      assert(in01(r.scoreFake), `scoreFake out of range: ${r.scoreFake}`);
      assert(in01(r.confidence), `confidence out of range: ${r.confidence}`);
      assert(r.windowEndMs > r.windowStartMs, "windowEndMs must be greater than windowStartMs");
      assert(Number.isFinite(r.latencyMs) && r.latencyMs >= 0, `bad latencyMs: ${r.latencyMs}`);
    }
    return `${results.length} results, median latency ${median(results.map((r) => r.latencyMs)).toFixed(1)} ms`;
  });
  await check(out, "audio", "silence gives confidence <= 0.2", async () => {
    const chunks = silenceChunks(20);
    const t0 = nowMs() + 20000;
    let last = null;
    for (let i = 0; i < chunks.length; i++) {
      const r = await d.audio.push(chunks[i], t0 + i * AUDIO_CHUNK_MS);
      if (r) last = r;
    }
    assert(last, "no result after 20 s of silence");
    assert(last.confidence <= 0.2, `confidence on silence is ${last.confidence}, expected <= 0.2`);
  });
  await check(out, "audio", "dispose() twice does not throw", async () => { d.audio.dispose(); d.audio.dispose(); });

  // ---------------- vision ----------------
  await check(out, "vision", "init within 30 s", async () => { await withTimeout(d.vision.init(init), 30000, "vision.init"); });
  await check(out, "vision", "blank frame: no face, aperture 0", async () => {
    if (d.vision.isMock) return "skipped (mock)";
    const r = await d.vision.processFrame(await env.loadBlankFrame(), nowMs());
    assert(r.faceFound === false, "faceFound must be false on a blank frame");
    assert(r.mouthAperture === 0, "mouthAperture must be 0 when no face is found");
  });
  await check(out, "vision", "test face: face found, values in range", async () => {
    const face = await env.loadTestFace();
    const lat: number[] = [];
    let r = await d.vision.processFrame(face, nowMs());
    for (let i = 0; i < 20; i++) {
      r = await d.vision.processFrame(face, nowMs() + (i + 1) * 100);
      lat.push(r.latencyMs);
    }
    assert(r.faceFound, "no face found in the test image (is assets/selftest/face.jpg present and clear?)");
    assert(Number.isFinite(r.mouthAperture) && r.mouthAperture >= 0 && r.mouthAperture <= 1, `mouthAperture out of range: ${r.mouthAperture}`);
    const hp = r.headPose;
    assert([hp.yawDeg, hp.pitchDeg, hp.rollDeg].every(Number.isFinite), "head pose angles must be finite");
    assert(in01(r.landmarkQuality), `landmarkQuality out of range: ${r.landmarkQuality}`);
    return `median latency ${median(lat).toFixed(1)} ms`;
  });
  await check(out, "vision", "dispose() twice does not throw", async () => { d.vision.dispose(); d.vision.dispose(); });

  // ---------------- sync ----------------
  await check(out, "sync", "returns null before enough data", async () => {
    d.sync.reset();
    const t0 = nowMs();
    const e = energySeries(syntheticSpeechChunks(1));
    const a = matchingAperture(1);
    for (let i = 0; i < e.length; i++) { d.sync.pushAudioEnergy(e[i], t0 + i * 100); d.sync.pushFrame(makeFrame(t0 + i * 100, { mouthAperture: a[i] })); }
    assert(d.sync.getSync() === null, "getSync() must be null after only 1 s of data");
  });
  const feed = (aperture: number[]) => {
    d.sync.reset();
    const e = energySeries(syntheticSpeechChunks(10));
    const t0 = nowMs();
    for (let i = 0; i < e.length; i++) { d.sync.pushAudioEnergy(e[i], t0 + i * 100); d.sync.pushFrame(makeFrame(t0 + i * 100, { mouthAperture: aperture[i] })); }
    return d.sync.getSync();
  };
  await check(out, "sync", "matching lips: low scoreFake, confidence > 0.5", async () => {
    if (d.sync.isMock) return "skipped (mock)";
    const r = feed(matchingAperture(10));
    assert(r, "getSync() returned null after 10 s of speech");
    assert(r.scoreFake < 0.4, `scoreFake ${r.scoreFake.toFixed(2)} should be < 0.4 for matching lips`);
    assert(r.confidence > 0.5, `confidence ${r.confidence.toFixed(2)} should be > 0.5`);
    return `scoreFake ${r.scoreFake.toFixed(2)}, correlation ${r.correlation.toFixed(2)}`;
  });
  await check(out, "sync", "unrelated lips: scoreFake > 0.6", async () => {
    if (d.sync.isMock) return "skipped (mock)";
    const r = feed(unrelatedAperture(10));
    assert(r, "getSync() returned null after 10 s of speech");
    assert(r.scoreFake > 0.6, `scoreFake ${r.scoreFake.toFixed(2)} should be > 0.6 for unrelated lips`);
    return `scoreFake ${r.scoreFake.toFixed(2)}, correlation ${r.correlation.toFixed(2)}`;
  });
  await check(out, "sync", "reset() returns to null", async () => { d.sync.reset(); assert(d.sync.getSync() === null, "getSync() must be null after reset()"); });

  // ---------------- challenge ----------------
  await check(out, "challenge", "init and poll() is null before start", async () => {
    await withTimeout(d.challenge.init(init), 30000, "challenge.init");
    assert(d.challenge.poll() === null, "poll() must be null before start()");
  });
  await check(out, "challenge", "clean yaw sweep passes", async () => {
    if (d.challenge.isMock) return "skipped (mock)";
    const t0 = nowMs();
    d.challenge.start("turn_head_left_right", t0);
    for (const f of yawSweepFrames(t0, 5)) d.challenge.pushFrame(f);
    const r = d.challenge.poll();
    assert(r && r.state === "passed", `expected passed, got ${r ? r.state : "null"}`);
    assert(in01(r.artifactScore) && r.artifactScore < 0.4, `artifactScore ${r.artifactScore} should be low for a clean sweep`);
    d.challenge.cancel();
  });
  await check(out, "challenge", "constant yaw fails after the time limit", async () => {
    if (d.challenge.isMock) return "skipped (mock)";
    const t0 = nowMs();
    d.challenge.start("turn_head_left_right", t0);
    for (const f of constantYawFrames(t0, 13)) d.challenge.pushFrame(f);
    const r = d.challenge.poll();
    assert(r && r.state === "failed", `expected failed, got ${r ? r.state : "null"}`);
    d.challenge.cancel();
  });
  await check(out, "challenge", "quality collapse at large yaw gives artifactScore > 0.5", async () => {
    if (d.challenge.isMock) return "skipped (mock)";
    const t0 = nowMs();
    d.challenge.start("turn_head_left_right", t0);
    for (const f of yawSweepFrames(t0, 5, 10, 35, true)) d.challenge.pushFrame(f);
    const r = d.challenge.poll();
    assert(r, "poll() returned null");
    assert(r.artifactScore > 0.5, `artifactScore ${r.artifactScore.toFixed(2)} should be > 0.5`);
    d.challenge.cancel();
  });
  await check(out, "challenge", "cancel() makes poll() null", async () => {
    d.challenge.start("turn_head_left_right", nowMs());
    d.challenge.cancel();
    assert(d.challenge.poll() === null, "poll() must be null after cancel()");
  });

  // ---------------- text ----------------
  await check(out, "text", "init", async () => { await withTimeout(d.text.init(init), 30000, "text.init"); });
  const classify = (e: EmailInput) => d.text.classify(e);
  await check(out, "text", "benign email is safe", async () => {
    const r = await classify(benignEmail);
    assert(r.label === "safe" && r.risk < 0.4, `benign email got label ${r.label}, risk ${r.risk}`);
  });
  await check(out, "text", "phishing email is flagged with reasons", async () => {
    const r = await classify(phishingEmail);
    assert(r.label !== "safe" && r.risk > 0.6, `phishing email got label ${r.label}, risk ${r.risk}`);
    assert(r.reasons.length >= 1, "phishing result must include at least one reason");
    return `risk ${r.risk.toFixed(2)}, ${r.reasons.length} reasons, ${r.latencyMs.toFixed(1)} ms`;
  });

  return out;
}
