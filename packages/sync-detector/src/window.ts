import type { FrameResult, SyncDetector, SyncResult } from "@sentinel/contracts";
import calibration from "./calibration.json";
import { bestLagCorrelation } from "./correlate";

type Sample<T> = { ts: number; value: T };
const STEP = 100, WINDOW = 8000;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function createSyncDetector(): SyncDetector {
  let audio: Sample<number>[] = [], frames: Sample<FrameResult>[] = [];
  const trim = (latest: number) => {
    const cutoff = latest - WINDOW - calibration.maxLagMs - STEP;
    audio = audio.filter((x) => x.ts >= cutoff); frames = frames.filter((x) => x.ts >= cutoff);
  };
  return {
    pushAudioEnergy(rms, tsMs) {
      if (!Number.isFinite(rms) || !Number.isFinite(tsMs)) return;
      audio.push({ ts: tsMs, value: Math.max(0, rms) }); trim(tsMs);
    },
    pushFrame(r) { if (Number.isFinite(r.tsMs)) { frames.push({ ts: r.tsMs, value: r }); trim(r.tsMs); } },
    getSync(): SyncResult | null {
      if (!audio.length || !frames.length) return null;
      const latest = Math.max(audio[audio.length - 1].ts, frames[frames.length - 1].ts);
      const start = latest - WINDOW + STEP;
      const count = Math.floor(WINDOW / STEP);
      const aSum = Array(count).fill(0), aN = Array(count).fill(0);
      const mSum = Array(count).fill(0), mN = Array(count).fill(0), faceN = Array(count).fill(0), frameN = Array(count).fill(0), qSum = Array(count).fill(0);
      for (const s of audio) { const i = Math.floor((s.ts - start) / STEP); if (i >= 0 && i < count) { aSum[i] += s.value; aN[i]++; } }
      for (const s of frames) {
        const i = Math.floor((s.ts - start) / STEP); if (i < 0 || i >= count) continue;
        frameN[i]++;
        if (s.value.faceFound) { faceN[i]++; mSum[i] += s.value.mouthAperture; mN[i]++; qSum[i] += s.value.landmarkQuality; }
      }
      const audioBins = aSum.map((sum, i) => aN[i] ? sum / aN[i] : null);
      const mouthBins = mSum.map((sum, i) => mN[i] ? sum / mN[i] : null);
      const speechCount = audioBins.filter((v) => v !== null && v > calibration.speechRms).length;
      const faceCount = faceN.reduce((a, b) => a + b, 0), frameCount = frameN.reduce((a, b) => a + b, 0);
      const faceFoundRatio = frameCount ? faceCount / frameCount : 0;
      if (speechCount * STEP < 3000 || faceFoundRatio < 0.6) return null;
      const speechAudio = audioBins.map((v) => v !== null && v > calibration.speechRms ? v : null);
      const speechMouth = mouthBins.map((v, i) => speechAudio[i] !== null ? v : null);
      const correlation = bestLagCorrelation(speechAudio, speechMouth, Math.round(calibration.maxLagMs / STEP));
      if (correlation === null) return null;
      const qTotal = qSum.reduce((a, b) => a + b, 0), qCount = faceN.reduce((a, b) => a + b, 0);
      const meanQuality = qCount ? qTotal / qCount : 0;
      const speechSeconds = speechCount * STEP / 1000;
      const confidence = clamp(Math.min(1, speechSeconds / 6) * faceFoundRatio * meanQuality, 0, 1);
      return {
        tsMs: latest,
        scoreFake: clamp((calibration.rHigh - correlation) / (calibration.rHigh - calibration.rLow), 0, 1),
        confidence, correlation, windowMs: WINDOW,
      };
    },
    reset() { audio = []; frames = []; },
  };
}
