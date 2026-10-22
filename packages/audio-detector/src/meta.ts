export type OutputKind = "logits2" | "logit1" | "sigmoid1" | "score1_bonafide";

export interface AudioModelMeta {
  id: string; sampleRate: 16000; windowSamples: number; hopSamples: number;
  inputName: string; outputName: string; outputKind: OutputKind; fakeIndex: number;
  features: "raw"; normalize: "none"; silenceRmsThreshold: number; thresholdFake: number;
  license: string; source: string;
}

const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

export function parseAudioModelMeta(value: unknown): AudioModelMeta {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Audio model metadata must be a JSON object");
  const m = value as Record<string, unknown>;
  for (const key of ["id", "inputName", "outputName", "license", "source"] as const) {
    if (typeof m[key] !== "string" || !m[key].trim()) throw new Error(`Audio model metadata '${key}' must be a non-empty string`);
  }
  if (m.sampleRate !== 16000) throw new Error("Audio model metadata 'sampleRate' must be 16000");
  for (const key of ["windowSamples", "hopSamples"] as const) {
    if (!Number.isInteger(m[key]) || !positive(m[key])) throw new Error(`Audio model metadata '${key}' must be a positive integer`);
  }
  if ((m.windowSamples as number) < 3200) throw new Error("Audio model metadata 'windowSamples' must be at least 3200 samples");
  if ((m.hopSamples as number) > (m.windowSamples as number)) throw new Error("Audio model metadata 'hopSamples' cannot exceed windowSamples");
  if (!["logits2", "logit1", "sigmoid1", "score1_bonafide"].includes(String(m.outputKind))) throw new Error("Audio model metadata 'outputKind' is unsupported");
  if (m.fakeIndex !== 0 && m.fakeIndex !== 1) throw new Error("Audio model metadata 'fakeIndex' must be 0 or 1");
  if (m.features !== "raw") throw new Error("This build supports only raw waveform models (features='raw')");
  if (m.normalize !== "none") throw new Error("This build supports only unnormalized audio (normalize='none')");
  if (!positive(m.silenceRmsThreshold)) throw new Error("Audio model metadata 'silenceRmsThreshold' must be positive");
  if (typeof m.thresholdFake !== "number" || !Number.isFinite(m.thresholdFake) || m.thresholdFake < 0 || m.thresholdFake > 1) throw new Error("Audio model metadata 'thresholdFake' must be in [0, 1]");
  return m as unknown as AudioModelMeta;
}
