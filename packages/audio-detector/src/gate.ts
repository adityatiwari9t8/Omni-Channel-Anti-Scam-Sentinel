export interface GateResult { speechRatio: number; rms: number; usable: boolean; }

export function gateWindow(samples: Float32Array, silenceRmsThreshold: number): GateResult {
  if (!samples.length || !Number.isFinite(silenceRmsThreshold) || silenceRmsThreshold <= 0) return { speechRatio: 0, rms: 0, usable: false };
  const frameSamples = 320;
  let voiced = 0, sumSquares = 0;
  for (let start = 0; start < samples.length; start += frameSamples) {
    const end = Math.min(samples.length, start + frameSamples);
    let frameSquares = 0;
    for (let i = start; i < end; i++) { const s = Number.isFinite(samples[i]) ? samples[i] : 0; frameSquares += s * s; }
    sumSquares += frameSquares;
    if (Math.sqrt(frameSquares / (end - start)) > silenceRmsThreshold) voiced++;
  }
  const count = Math.ceil(samples.length / frameSamples);
  const speechRatio = count ? voiced / count : 0;
  return { speechRatio, rms: Math.sqrt(sumSquares / samples.length), usable: speechRatio >= 0.3 };
}
