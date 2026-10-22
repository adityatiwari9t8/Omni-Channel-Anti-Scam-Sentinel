import type { AudioModelMeta } from "./meta";
export interface ConvertedScore { scoreFake: number; confidence: number; }
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const sigmoid = (x: number) => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));

export function scoreOutput(values: ArrayLike<number>, meta: Pick<AudioModelMeta, "outputKind" | "fakeIndex" | "thresholdFake">, speechRatio = 1): ConvertedScore {
  const invalid = { scoreFake: 0, confidence: 0 };
  if (!values.length || Array.from(values).some((v) => !Number.isFinite(v))) return invalid;
  let score: number;
  switch (meta.outputKind) {
    case "logits2": {
      if (values.length < 2) return invalid;
      const a = values[0], b = values[1], max = Math.max(a, b), ea = Math.exp(a - max), eb = Math.exp(b - max);
      score = (meta.fakeIndex === 0 ? ea : eb) / (ea + eb); break;
    }
    case "logit1": score = sigmoid(values[0]); break;
    case "sigmoid1": score = values[0]; break;
    case "score1_bonafide": score = 1 - values[0]; break;
    default: return invalid;
  }
  if (!Number.isFinite(score)) return invalid;
  score = clamp01(score);
  const gate = clamp01(speechRatio / 0.6), margin = clamp01(Math.abs(score - meta.thresholdFake) / 0.25);
  return { scoreFake: score, confidence: gate * margin };
}
