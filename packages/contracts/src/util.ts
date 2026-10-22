import type { Ms, Score01 } from "./types";

/** The shared clock used by every context: performance.timeOrigin + performance.now(). */
export const nowMs = (): Ms => performance.timeOrigin + performance.now();

/** Root-mean-square of a chunk. Returns 0 for an empty chunk. */
export function rms(chunk: Float32Array): number {
  let s = 0;
  for (let i = 0; i < chunk.length; i++) s += chunk[i] * chunk[i];
  return Math.sqrt(s / Math.max(1, chunk.length));
}

export const clamp01 = (x: number): Score01 => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
