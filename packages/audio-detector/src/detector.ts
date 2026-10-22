import type { AudioDetector as AudioDetectorContract, AudioResult, InitOptions } from "@sentinel/contracts";
import * as ort from "onnxruntime-web/webgpu";
import { gateWindow } from "./gate";
import { parseAudioModelMeta, type AudioModelMeta } from "./meta";
import { createOrtSession, type InferenceSessionLike } from "./ort";
import { scoreOutput } from "./score";
import { AudioWindowing, type AudioWindow } from "./windowing";

export type AudioSessionFactory = (assetBase: string, meta: AudioModelMeta, preferWebGPU?: boolean) => Promise<{ session: InferenceSessionLike; backend: "webgpu" | "wasm" }>;
export type AudioMetaLoader = (assetBase: string) => Promise<AudioModelMeta>;
const loadMeta: AudioMetaLoader = async (base) => {
  const response = await fetch(`${base}models/audio/meta.json`);
  if (!response.ok) throw new Error(`Could not load audio model metadata (${response.status})`);
  return parseAudioModelMeta(await response.json());
};

/** Real ONNX-backed Role 1 detector. Dependencies are injectable for pure Node tests. */
export class AudioDetectorImpl implements AudioDetectorContract {
  private meta: AudioModelMeta | null = null;
  private session: InferenceSessionLike | null = null;
  private windowing: AudioWindowing | null = null;
  private busy = false;
  private pending: { window: AudioWindow; resolve: (value: AudioResult | null) => void } | null = null;
  private errorStreak = 0;
  private warned = false;
  errorCount = 0;
  dropped = 0;
  backend: "webgpu" | "wasm" | null = null;

  constructor(private readonly sessionFactory: AudioSessionFactory = createOrtSession, private readonly metaLoader: AudioMetaLoader = loadMeta) {}

  async init(opts: InitOptions): Promise<void> {
    this.dispose();
    const meta = await this.metaLoader(opts.assetBase);
    const result = await this.sessionFactory(opts.assetBase, meta, opts.preferWebGPU ?? false);
    this.meta = meta; this.session = result.session; this.backend = result.backend;
    this.windowing = new AudioWindowing(meta.windowSamples, meta.hopSamples);
  }

  push(chunk: Float32Array, tsMs: number): Promise<AudioResult | null> {
    if (!this.meta || !this.session || !this.windowing) return Promise.resolve(null);
    const window = this.windowing.push(chunk, tsMs);
    if (!window) return Promise.resolve(null);
    return new Promise((resolve) => {
      if (this.busy) {
        if (this.pending) { this.pending.resolve(null); this.dropped++; }
        this.pending = { window, resolve };
      } else {
        this.busy = true;
        void this.drain({ window, resolve });
      }
    });
  }

  private async drain(current: { window: AudioWindow; resolve: (value: AudioResult | null) => void }): Promise<void> {
    let job: typeof current | null = current;
    while (job) {
      const result = await this.infer(job.window);
      job.resolve(result);
      job = this.pending;
      this.pending = null;
    }
    this.busy = false;
  }

  private async infer(window: AudioWindow): Promise<AudioResult> {
    const started = performance.now();
    const meta = this.meta!, session = this.session!;
    try {
      const gate = gateWindow(window.samples, meta.silenceRmsThreshold);
      if (!gate.usable) return { windowStartMs: window.windowStartMs, windowEndMs: window.windowEndMs, scoreFake: 0, confidence: 0, latencyMs: Math.max(0, performance.now() - started) };
      const output = await session.run({ [meta.inputName]: this.makeTensor(window.samples) });
      const values = output[meta.outputName]?.data;
      const scored = values ? scoreOutput(values as ArrayLike<number>, meta, gate.speechRatio) : { scoreFake: 0, confidence: 0 };
      this.errorStreak = 0;
      return { windowStartMs: window.windowStartMs, windowEndMs: window.windowEndMs, ...scored, latencyMs: Math.max(0, performance.now() - started) };
    } catch (error) {
      this.errorCount++; this.errorStreak++;
      if (this.errorStreak >= 3 && !this.warned) { this.warned = true; console.warn("Audio detector has encountered three consecutive inference errors; continuing with zero-confidence results.", error); }
      return { windowStartMs: window.windowStartMs, windowEndMs: window.windowEndMs, scoreFake: 0, confidence: 0, latencyMs: Math.max(0, performance.now() - started) };
    }
  }

  private makeTensor(samples: Float32Array): unknown {
    return new ort.Tensor("float32", new Float32Array(samples), [1, samples.length]);
  }

  dispose(): void {
    try { this.session?.release?.(); } catch { /* best effort cleanup */ }
    this.session = null; this.meta = null; this.windowing?.reset(); this.windowing = null;
    this.backend = null; this.pending?.resolve(null); this.pending = null; this.busy = false;
    this.errorStreak = 0; this.warned = false;
  }
}
