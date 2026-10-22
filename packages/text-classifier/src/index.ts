import type { EmailInput, InitOptions, TextClassifier, TextResult } from "@sentinel/contracts";
import { evaluateRules } from "./rules";
import { modelProbability } from "./model";

export class TextClassifierImpl implements TextClassifier {
  async init(_opts: InitOptions): Promise<void> { /* all rule data is bundled locally */ }
  async classify(email: EmailInput): Promise<TextResult> {
    const started = performance.now();
    const { ruleRisk, reasons } = evaluateRules(email);
    const modelProb = modelProbability(email);
    // Down-weight a model trained only on synthetic mail so it can support rules
    // without overwhelming them on out-of-distribution human-written messages.
    const risk = Math.min(1, Math.max(0, 1 - (1 - ruleRisk) * (1 - 0.6 * modelProb)));
    const label = risk < 0.35 ? "safe" : risk < 0.65 ? "suspicious" : "phishing";
    return { risk, label, reasons: reasons.slice(0, 4).map((r) => r.text), latencyMs: Math.max(0, performance.now() - started) };
  }
}
export function createTextClassifier(): TextClassifier { return new TextClassifierImpl(); }
