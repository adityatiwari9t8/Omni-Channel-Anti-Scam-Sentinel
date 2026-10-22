export function rms(chunk: Float32Array): number {
  let s = 0;
  for (let i = 0; i < chunk.length; i++) {
    s += chunk[i] * chunk[i];
  }
  return Math.sqrt(s / Math.max(1, chunk.length));
}
