import type { PopupToSw, Settings, SwState } from "@sentinel/contracts";
import { loadSettings, saveSettings } from "../shared/settings";

let currentTabId: number | null = null;
let isMonitoring = false;

async function getState(): Promise<SwState> {
  const settings = await loadSettings();
  return {
    running: isMonitoring,
    tabId: currentTabId,
    settings,
  };
}

async function ensureOffscreen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT" as any],
  });
  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"] as any,
    justification: "Analyze call audio and video entirely on-device and route playback to speakers.",
  });
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
  const settings = await loadSettings();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });

  await ensureOffscreen();

  currentTabId = tabId;
  isMonitoring = true;

  // Send start to offscreen
  await chrome.runtime.sendMessage({
    v: 1,
    target: "offscreen",
    t: "OFFSCREEN_START",
    streamId,
    settings,
  });

  // Notify content script on the tab
  try {
    await chrome.tabs.sendMessage(tabId, { v: 1, t: "MEET_START", settings });
  } catch (err) {
    console.warn("[background] Tab message failed (script may load later):", err);
  }

  // Persist session state
  await chrome.storage.session.set({ running: true, tabId });
}

async function stop(): Promise<void> {
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
      title: "Sentinel Alert: Suspicious Call Detected",
      message: msg.reason || "Potential deepfake synthesis detected on call.",
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
    const isMeetingUrl =
      changeInfo.url.includes("meet.google.com") || changeInfo.url.includes("zoom.us");
    if (!isMeetingUrl) {
      void stop();
    }
  }
});
