import type { PopupToSw, Settings, SwState } from "@sentinel/contracts";
import { loadSettings, saveSettings } from "../shared/settings";
import { isSupportedCallUrl } from "../shared/meeting-url";

let currentTabId: number | null = null;
let isMonitoring = false;
let operationGeneration = 0;
let creatingOffscreen: Promise<void> | null = null;

async function getState(): Promise<SwState> {
  const settings = await loadSettings();
  const stored = await chrome.storage.session.get(["running", "tabId"]);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT" as any],
    documentUrls: [chrome.runtime.getURL("offscreen.html")],
  });
  if (stored.running === true && typeof stored.tabId === "number" && contexts.length > 0) {
    isMonitoring = true;
    currentTabId = stored.tabId;
  } else {
    isMonitoring = false;
    currentTabId = null;
    await chrome.storage.session.set({ running: false, tabId: null });
  }
  return {
    running: isMonitoring,
    tabId: currentTabId,
    settings,
  };
}

async function ensureOffscreen(): Promise<void> {
  if (creatingOffscreen) return creatingOffscreen;
  creatingOffscreen = (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as any],
      documentUrls: [chrome.runtime.getURL("offscreen.html")],
    });
    if (contexts.length > 0) return;
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"] as any,
      justification: "Analyze call audio and video entirely on-device and route playback to speakers.",
    });
  })();
  try { await creatingOffscreen; }
  finally { creatingOffscreen = null; }
}

async function closeOffscreen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT" as any],
  });
  if (contexts.length > 0) {
    await chrome.offscreen.closeDocument();
  }
}

async function start(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (!isSupportedCallUrl(tab.url ?? "")) {
    throw new Error("Open a Google Meet or Zoom Web call tab before starting Sentinel.");
  }

  const generation = ++operationGeneration;
  try {
    const [settings] = await Promise.all([loadSettings(), ensureOffscreen()]);
    if (generation !== operationGeneration) {
      if (operationGeneration === generation + 1 && !isMonitoring) await closeOffscreen();
      return;
    }
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    if (generation !== operationGeneration) return;

    const started = await chrome.runtime.sendMessage({
      v: 1,
      target: "offscreen",
      t: "OFFSCREEN_START",
      streamId,
      settings,
    });
    if (generation !== operationGeneration) return;
    if (!started?.ok) throw new Error(started?.error || "The inference engine did not start.");

    currentTabId = tabId;
    isMonitoring = true;
    await chrome.storage.session.set({ running: true, tabId });
    try {
      await chrome.tabs.sendMessage(tabId, { v: 1, t: "MEET_START", settings });
    } catch (err) {
      console.warn("[background] Tab message failed (script may load later):", err);
    }
  } catch (error) {
    if (generation === operationGeneration) {
      isMonitoring = false;
      currentTabId = null;
      try { await chrome.runtime.sendMessage({ v: 1, target: "offscreen", t: "OFFSCREEN_STOP" }); } catch { /* context may not exist */ }
      await closeOffscreen();
      await chrome.storage.session.set({ running: false, tabId: null });
    }
    throw error;
  }
}

async function stop(): Promise<void> {
  operationGeneration++;
  isMonitoring = false;
  const tabId = currentTabId;
  currentTabId = null;

  try {
    await chrome.runtime.sendMessage({
      v: 1,
      target: "offscreen",
      t: "OFFSCREEN_STOP",
    });
  } catch {
    // Offscreen document may already be closed
  }

  if (tabId !== null) {
    try {
      await chrome.tabs.sendMessage(tabId, { v: 1, t: "MEET_STOP" });
    } catch {
      // Tab may have been closed
    }
  }

  await closeOffscreen();
  await chrome.storage.session.set({ running: false, tabId: null });
}

// Service worker listeners
chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
  if (msg?.target === "offscreen") return; // destined for offscreen document

  // Notification request from offscreen document
  if (msg?.t === "TRIGGER_NOTIFICATION") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: "Sentinel advisory: review call signals",
      message: msg.reason || "Possible synthetic-media signals. Verify through a trusted channel.",
      priority: 2,
    });
    return;
  }

  const m = msg as PopupToSw;
  if (!m || m.v !== 1) return;

  if (m.t === "START") {
    start(m.tabId).then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: String(err) }),
    );
    return true;
  }

  if (m.t === "STOP") {
    stop().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (m.t === "GET_STATE") {
    getState().then(sendResponse);
    return true;
  }

  if (m.t === "SET_SETTINGS") {
    saveSettings(m.settings).then(() => {
      // Forward to offscreen if running
      if (isMonitoring) {
        chrome.runtime.sendMessage({
          v: 1,
          target: "offscreen",
          t: "SETTINGS",
          settings: m.settings,
        }).catch(() => {});
      }
      sendResponse({ ok: true });
    });
    return true;
  }
});

// Tab cleanup
chrome.tabs.onRemoved.addListener((closedTabId) => {
  if (closedTabId === currentTabId) {
    void stop();
  }
});

chrome.tabs.onUpdated.addListener((updatedTabId, changeInfo) => {
  if (updatedTabId === currentTabId && changeInfo.url) {
    if (!isSupportedCallUrl(changeInfo.url)) {
      void stop();
    }
  }
});
