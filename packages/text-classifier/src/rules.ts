import type { EmailInput } from "@sentinel/contracts";

export interface RuleReason { id: string; points: number; text: string; }
export const KNOWN_BRANDS: Readonly<Record<string, readonly string[]>> = {
  paypal: ["paypal.com"], google: ["google.com", "google.co.in"], microsoft: ["microsoft.com", "live.com", "outlook.com"],
  apple: ["apple.com", "icloud.com"], amazon: ["amazon.com", "amazon.in"], netflix: ["netflix.com"],
  bank: ["bankofamerica.com", "chase.com", "sbi.co.in"],
};
export const URL_SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "ow.ly", "is.gd", "buff.ly", "rb.gy", "shorturl.at"]);
const BRAND_NAMES = Object.keys(KNOWN_BRANDS);

function domainOf(value: string): string {
  const candidate = value.trim().includes("://") ? value.trim() : `https://${value.trim()}`;
  try { return new URL(candidate).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
function emailDomain(address: string): string { const at = address.lastIndexOf("@"); return at < 0 ? "" : domainOf(address.slice(at + 1)); }
function rootLabel(host: string): string { return host.split(".")[0]?.replace(/[^a-z0-9]/g, "") ?? ""; }
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const old = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = old; }
  }
  return row[b.length];
}
function knownBrandForDomain(host: string): string | undefined {
  return BRAND_NAMES.find((name) => KNOWN_BRANDS[name].some((domain) => host === domain || host.endsWith(`.${domain}`)));
}
function hostLooksLikeBrand(host: string): string | undefined {
  if (!host) return undefined;
  const label = rootLabel(host);
  return BRAND_NAMES.find((name) => {
    const base = name.replace(/[^a-z0-9]/g, "");
    const normalized = label.replace(/1/g, "l").replace(/0/g, "o");
    return label !== base && (label.includes(base) || editDistance(label, base) <= 2 || normalized.includes(base));
  });
}

export function evaluateRules(email: EmailInput): { ruleRisk: number; reasons: RuleReason[] } {
  const fired: RuleReason[] = [];
  const body = `${email.subject} ${email.bodyText}`.toLowerCase();
  const add = (id: string, points: number, text: string) => fired.push({ id, points, text });
  if (/\b(immediately|within\s+\d+\s+hours?|account\s+will\s+be\s+closed|final\s+notice|act\s+now|urgent)\b/i.test(body)) add("urgency", 0.15, "The message pressures you to act urgently.");
  if (/\b(verify|confirm|update)\b.{0,50}\b(password|login|account|card|credentials?)\b|\b(password|login|account|card|credentials?)\b.{0,50}\b(verify|confirm|update)\b/i.test(body)) add("credentials", 0.25, "The message asks you to verify or update sensitive account details.");
  if (/\b(gift\s+cards?|wire\s+transfer|cryptocurrency|crypto|invoice\s+attached|bitcoin|unusual\s+payment)\b/i.test(body)) add("payment", 0.20, "The message requests an unusual or hard-to-reverse payment.");

  for (const link of email.links ?? []) {
    const displayed = domainOf(link.text);
    const actual = domainOf(link.href);
    if (displayed && actual && displayed !== actual && !actual.endsWith(`.${displayed}`) && !displayed.endsWith(`.${actual}`)) {
      add("link-mismatch", 0.30, `A link displays ${displayed} but opens ${actual}.`); break;
    }
  }

  const senderDomain = emailDomain(email.senderAddress);
  const senderBrand = BRAND_NAMES.find((brand) => email.senderName.toLowerCase().includes(brand));
  if (senderBrand && !KNOWN_BRANDS[senderBrand].some((domain) => senderDomain === domain || senderDomain.endsWith(`.${domain}`))) add("display-spoof", 0.25, `The sender name uses ${senderBrand}, but the email address is from ${senderDomain || "an unknown domain"}.`);

  const lookalike = [senderDomain, ...(email.links ?? []).map((l) => domainOf(l.href))].map(hostLooksLikeBrand).find(Boolean);
  if (lookalike) add("lookalike", 0.25, `A sender or link domain resembles ${lookalike} without using its official domain.`);

  if (email.replyTo) {
    const replyDomain = emailDomain(email.replyTo);
    if (senderDomain && replyDomain && senderDomain !== replyDomain) add("reply-to", 0.15, "The reply-to address uses a different domain from the sender.");
  }

  const risky = (email.links ?? []).map((link) => ({ host: domainOf(link.href), href: link.href })).find(({ host, href }) =>
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || URL_SHORTENERS.has(host) || /@/.test(href) || host.startsWith("xn--"));
  if (risky) add("risky-link", 0.20, "A link uses a shortened, disguised, or unusual address.");

  const letters = email.subject.replace(/[^a-z]/gi, "");
  if (letters.length >= 5 && (email.subject.match(/!/g)?.length ?? 0) >= 2 || letters.length >= 8 && (email.subject.match(/[A-Z]/g)?.length ?? 0) / letters.length > 0.75) add("shouting", 0.05, "The subject uses excessive capital letters or exclamation marks.");
  const ruleRisk = 1 - fired.reduce((remaining, rule) => remaining * (1 - rule.points), 1);
  return { ruleRisk, reasons: fired.sort((a, b) => b.points - a.points || a.id.localeCompare(b.id)) };
}
