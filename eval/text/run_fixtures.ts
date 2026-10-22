import { readFileSync, writeFileSync } from "node:fs";
import { createTextClassifier } from "../../packages/text-classifier/src/index";

type Case = { id: string; label: "safe" | "phishing"; subject: string; body: string };
const cases = JSON.parse(readFileSync("eval/text/fixtures.json", "utf8")) as Case[];
const classifier = createTextClassifier();
await classifier.init({ assetBase: "" });
const rows = [];
for (const item of cases) {
  const result = await classifier.classify({ subject: item.subject, bodyText: item.body, links: [], senderName: "", senderAddress: "" });
  rows.push({ ...item, risk: result.risk, predicted: result.label, correct: result.label === item.label, reasons: result.reasons });
}
const positives = rows.filter((r) => r.label === "phishing");
const negatives = rows.filter((r) => r.label === "safe");
const predictedPositive = (r: typeof rows[number]) => r.predicted !== "safe";
const tp = positives.filter(predictedPositive).length;
const fn = positives.length - tp;
const fp = negatives.filter(predictedPositive).length;
const tn = negatives.length - fp;
const output = {
  note: "Hand-authored smoke fixtures; not an estimate of population-level accuracy.",
  count: rows.length,
  accuracy: (tn + tp) / rows.length,
  phishingPrecision: tp / Math.max(1, tp + fp),
  phishingRecall: tp / Math.max(1, tp + fn),
  falsePositiveRate: fp / Math.max(1, fp + tn),
  confusionMatrix: { tn, fp, fn, tp },
  cases: rows,
};
writeFileSync("eval/text/fixture-results.json", `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ ...output, cases: undefined }, null, 2));
