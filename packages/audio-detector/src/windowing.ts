export interface AudioWindow { samples: Float32Array; windowStartMs: number; windowEndMs: number; }

/** Streaming window builder for 16 kHz PCM. It retains only the latest model window. */
export class AudioWindowing {
  private samples = new Float32Array(0);
  private firstChunkTs: number | null = null;
  private totalSamples = 0;
  private lastEmittedAt = 0;
  private lastChunkTs: number | null = null;
  private lastChunkLength = 0;

  constructor(readonly windowSamples: number, readonly hopSamples: number) {
    if (!Number.isInteger(windowSamples) || windowSamples <= 0 || !Number.isInteger(hopSamples) || hopSamples <= 0 || hopSamples > windowSamples) throw new Error("Invalid windowing dimensions");
  }
  reset(): void {
    this.samples = new Float32Array(0); this.firstChunkTs = null; this.totalSamples = 0;
    this.lastEmittedAt = 0; this.lastChunkTs = null; this.lastChunkLength = 0;
  }
  push(chunk: Float32Array, tsMs: number): AudioWindow | null {
    if (!(chunk instanceof Float32Array) || chunk.length === 0 || !Number.isFinite(tsMs)) return null;
    if (this.lastChunkTs !== null && Math.abs(tsMs - (this.lastChunkTs + this.lastChunkLength / 16)) > 250) this.reset();
    if (this.firstChunkTs === null) this.firstChunkTs = tsMs;
    const joined = new Float32Array(this.samples.length + chunk.length);
    joined.set(this.samples); joined.set(chunk, this.samples.length);
    this.totalSamples += chunk.length;
    this.samples = joined.length > this.windowSamples ? joined.slice(joined.length - this.windowSamples) : joined;
    this.lastChunkTs = tsMs; this.lastChunkLength = chunk.length;
    if (this.totalSamples < this.windowSamples || this.totalSamples - this.lastEmittedAt < this.hopSamples) return null;
    this.lastEmittedAt = this.totalSamples;
    const start = this.firstChunkTs! + (this.totalSamples - this.windowSamples) / 16;
    return { samples: this.samples.slice(), windowStartMs: start, windowEndMs: start + this.windowSamples / 16 };
  }
}

/** Replaces queued work with the newest window while inference is busy. */
export class LatestWindowQueue<T> {
  private pending: { value: T; resolve: (value: T | null) => void } | null = null;
  dropped = 0;
  enqueue(value: T): Promise<T | null> {
    return new Promise((resolve) => {
      if (this.pending) { this.pending.resolve(null); this.dropped++; }
      this.pending = { value, resolve };
    });
  }
  take(): { value: T; resolve: (value: T | null) => void } | null { const item = this.pending; this.pending = null; return item; }
}
