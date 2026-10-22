import weights from "./weights.json";
import type { EmailInput } from "@sentinel/contracts";
import { tokenize } from "./tokenize";
type ModelWeights = { trained: boolean; intercept: number; vocabulary: Record<string, number>; weights: Record<string, number> };
const modelWeights = weights as ModelWeights;

/** Sparse TF-IDF/logistic-regression inference matching the training export. */
export function modelProbability(email: EmailInput): number {
  if (!modelWeights.trained || Object.keys(modelWeights.vocabulary).length === 0) return 0;
  const tokens = tokenize(`${email.subject} ${email.bodyText}`);
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  const values: Array<[number, number]> = [];
  let z: number = modelWeights.intercept;
  for (const [token, count] of counts) {
    const idf = modelWeights.vocabulary[token];
    const coefficient = modelWeights.weights[token];
    if (idf !== undefined && coefficient !== undefined) values.push([count * idf, coefficient]);
  }
  const norm = Math.sqrt(values.reduce((sum, [value]) => sum + value * value, 0)) || 1;
  for (const [value, coefficient] of values) z += (value / norm) * coefficient;
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}
