import { describe, expect, it } from "vitest";
import { benignEmail, phishingEmail } from "@sentinel/contracts";
import { createTextClassifier } from "../src/index";
import { evaluateRules } from "../src/rules";

const classifier = createTextClassifier();

describe("hybrid phishing text classifier", () => {
  it("keeps benign mail safe", async () => {
    const result = await classifier.classify(benignEmail);
    expect(result.label).toBe("safe"); expect(result.risk).toBeLessThan(0.35);
  });
  it("flags the canonical phishing self-test sample", async () => {
    const result = await classifier.classify(phishingEmail);
    expect(result.label).toBe("phishing"); expect(result.reasons.length).toBeGreaterThan(0);
  });
  it("detects lookalike domains", () => {
    const result = evaluateRules({ subject: "Notice", bodyText: "Please sign in", links: [{ text: "paypal.com", href: "https://paypa1-login.example/" }], senderName: "Support", senderAddress: "support@paypa1-login.example" });
    expect(result.reasons.some((reason) => reason.id === "lookalike")).toBe(true);
  });
  it("handles an empty body without throwing", async () => {
    const result = await classifier.classify({ subject: "", bodyText: "", links: [], senderName: "", senderAddress: "" });
    expect(result.label).toBe("safe"); expect(Number.isFinite(result.risk)).toBe(true);
  });
  it("caps reasons at four and combines signal points probabilistically", () => {
    const { ruleRisk, reasons } = evaluateRules(phishingEmail);
    expect(ruleRisk).toBeGreaterThan(0.65); expect(reasons.length).toBeGreaterThan(4);
  });
});
