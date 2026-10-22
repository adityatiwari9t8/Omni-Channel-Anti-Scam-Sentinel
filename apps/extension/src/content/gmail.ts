import { createTextClassifier } from "@sentinel/text-classifier";
import type { EmailInput, TextResult } from "@sentinel/contracts";
import { GMAIL_CONFIG } from "./gmail-config";

const HOST_ID = "sentinel-gmail-warning";
const classifier = createTextClassifier();
let initPromise: Promise<void> | undefined;
let queued = false;
let lastKey = "";
let generation = 0;

function textOf(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function extractEmail(): EmailInput | null {
  const subject = document.querySelector(GMAIL_CONFIG.subjectSelector);
  const body = document.querySelector(GMAIL_CONFIG.bodySelector);
  if (!subject || !body || !textOf(subject) || !textOf(body)) return null;

  const sender = body.closest(".adn")?.querySelector(GMAIL_CONFIG.senderSelector)
    ?? document.querySelector(GMAIL_CONFIG.senderSelector);
  const senderAddress = sender?.getAttribute("email") ?? "";
  const links = Array.from(body.querySelectorAll("a[href]"), (link) => ({
    text: textOf(link),
    href: (link as HTMLAnchorElement).href,
  })).filter((link) => link.href);

  return {
    subject: textOf(subject),
    bodyText: textOf(body),
    links,
    senderName: textOf(sender),
    senderAddress,
  };
}

function addBanner(result: TextResult | null, failure = false): void {
  let host = document.getElementById(HOST_ID);
  const anchor = document.querySelector(GMAIL_CONFIG.bodySelector);
  if (!anchor) return;
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "display:block;margin:8px 0;";
  }
  if (host.parentElement !== anchor.parentElement) anchor.parentElement?.insertBefore(host, anchor);
  if (!host.shadowRoot) host.attachShadow({ mode: "open" });
  const root = host.shadowRoot!;
  root.replaceChildren();

  const box = document.createElement("section");
  const color = failure ? "#7c2d12" : result?.label === "phishing" ? "#991b1b" : result?.label === "suspicious" ? "#854d0e" : "#166534";
  box.setAttribute("role", result?.label === "safe" ? "status" : "alert");
  box.setAttribute("aria-live", "polite");
  box.style.cssText = `font:13px/1.45 Arial,sans-serif;border:1px solid ${color};border-left:5px solid ${color};border-radius:6px;background:#fff;padding:10px 12px;color:#202124;max-width:900px;box-shadow:0 1px 3px #0002`;

  const title = document.createElement("strong");
  title.style.color = color;
  title.textContent = failure
    ? "Sentinel could not check this message locally"
    : `Sentinel: ${result!.label.toUpperCase()} · ${Math.round(result!.risk * 100)}% risk signal`;
  box.append(title);

  const note = document.createElement("div");
  note.style.marginTop = "3px";
  note.textContent = failure
    ? "Try reopening the message. Email content is not saved or uploaded by Sentinel."
    : result!.label === "safe"
      ? "No warning signals found. This is not a guarantee that the message is safe."
      : "Review the sender and links carefully. This prototype can make mistakes.";
  box.append(note);

  if (result?.reasons.length) {
    const list = document.createElement("ul");
    list.style.cssText = "margin:5px 0 0;padding-left:20px";
    for (const reason of result.reasons) {
      const item = document.createElement("li");
      item.textContent = reason;
      list.append(item);
    }
    box.append(list);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Dismiss";
  close.setAttribute("aria-label", "Dismiss Sentinel message check");
  close.style.cssText = "margin-top:6px;padding:3px 8px;border:1px solid #dadce0;border-radius:4px;background:#f8f9fa;color:#202124;cursor:pointer";
  close.addEventListener("click", () => host?.remove());
  box.append(close);
  root.append(box);
}

async function checkCurrentMessage(): Promise<void> {
  if (!GMAIL_CONFIG.enabled) return;
  const email = extractEmail();
  if (!email) {
    document.getElementById(HOST_ID)?.remove();
    lastKey = "";
    return;
  }
  // Avoid rerunning inference for unrelated Gmail DOM updates.
  const key = JSON.stringify(email);
  if (key === lastKey) return;
  lastKey = key;
  const run = ++generation;
  try {
    initPromise ??= classifier.init({ assetBase: chrome.runtime.getURL("") });
    await initPromise;
    const result = await classifier.classify(email);
    if (run === generation && document.querySelector(GMAIL_CONFIG.bodySelector)) addBanner(result);
  } catch {
    if (run === generation) addBanner(null, true);
  }
}

function queueCheck(): void {
  if (queued) return;
  queued = true;
  window.setTimeout(() => {
    queued = false;
    void checkCurrentMessage();
  }, 350);
}

if (GMAIL_CONFIG.enabled) {
  const observer = new MutationObserver(queueCheck);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  queueCheck();
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    generation++;
  }, { once: true });
}
