import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_SETTINGS,
  type PopupToSw,
  type Sensitivity,
  type Settings,
  type SwState,
} from "@sentinel/contracts";
import { isSupportedCallUrl } from "../shared/meeting-url";

type ServiceWorkerReply = { ok: boolean; error?: string };

function sendMessage<T>(message: PopupToSw): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function PopupApp() {
  const [running, setRunning] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [runningTabId, setRunningTabId] = useState<number | null>(null);
  const [isSupportedCall, setIsSupportedCall] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const [tabs, state] = await Promise.all([
          chrome.tabs.query({ active: true, currentWindow: true }),
          sendMessage<SwState>({ v: 1, t: "GET_STATE" }),
        ]);
        if (!isMounted) return;

        const tab = tabs[0];
        const tabId = typeof tab?.id === "number" ? tab.id : null;
        setActiveTabId(tabId);
        setIsSupportedCall(isSupportedCallUrl(tab?.url ?? ""));
        setRunning(state?.running === true);
        setRunningTabId(typeof state?.tabId === "number" ? state.tabId : null);
        setSettings(state?.settings ?? DEFAULT_SETTINGS);
      } catch (error) {
        if (isMounted) setErrorMsg(`Could not read Sentinel status: ${getErrorMessage(error)}`);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => { isMounted = false; };
  }, []);

  const handleToggleRunning = async () => {
    if (isPending) return;
    setErrorMsg(null);
    setIsPending(true);

    try {
      if (!running) {
        if (activeTabId === null || !isSupportedCall) return;
        const response = await sendMessage<ServiceWorkerReply>({ v: 1, t: "START", tabId: activeTabId });
        if (!response?.ok) throw new Error(response?.error || "Could not start monitoring.");
        setRunning(true);
        setRunningTabId(activeTabId);
      } else {
        const response = await sendMessage<ServiceWorkerReply>({ v: 1, t: "STOP" });
        if (!response?.ok) throw new Error(response?.error || "Could not stop monitoring.");
        setRunning(false);
        setRunningTabId(null);
      }
    } catch (error) {
      setErrorMsg(getErrorMessage(error));
      if (!running) setRunning(false);
    } finally {
      setIsPending(false);
    }
  };

  const updateSettings = async (partial: Partial<Settings>) => {
    const previous = settings;
    const updated = { ...settings, ...partial };
    setSettings(updated);
    setErrorMsg(null);
    try {
      const response = await sendMessage<ServiceWorkerReply>({ v: 1, t: "SET_SETTINGS", settings: updated });
      if (!response?.ok) throw new Error(response?.error || "Could not save settings.");
    } catch (error) {
      setSettings(previous);
      setErrorMsg(`Settings were not saved: ${getErrorMessage(error)}`);
    }
  };

  const updateMock = (key: keyof Settings["useMock"], value: boolean) => {
    void updateSettings({ useMock: { ...settings.useMock, [key]: value } });
  };

  const monitoringThisTab = running && runningTabId === activeTabId;
  const statusTitle = isLoading
    ? "Checking active tab"
    : running
      ? monitoringThisTab ? "Monitoring this tab" : "Monitoring another tab"
      : isSupportedCall ? "Ready for a call" : "Standby";
  const statusDetail = isLoading
    ? "Reading the active page and monitor state."
    : running
      ? monitoringThisTab ? "Call media is being analyzed on this device." : "Sentinel is active in a different tab."
      : isSupportedCall
        ? "Start monitoring when you are ready."
        : "Open a Google Meet or Zoom Web call to begin.";
  const buttonLabel = isLoading
    ? "Checking active tab…"
    : isPending
      ? running ? "Stopping monitoring…" : "Starting on-device analysis…"
      : running
        ? "Stop monitoring"
        : isSupportedCall ? "Start on this call" : "Open Meet or Zoom to start";

  return (
    <main className="popup-container">
      <header className="popup-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false"><path d="M12 2.7 20 6v5.2c0 5.1-3.4 8.3-8 10.1-4.6-1.8-8-5-8-10.1V6l8-3.3Z"/><path d="m8.6 12.1 2.2 2.2 4.7-4.8"/></svg>
          </span>
          <span className="brand-copy"><strong>Sentinel</strong><small>CALL INTEGRITY</small></span>
        </div>
        <span className="version-pill">v0.1.0</span>
      </header>

      <section className={`status-card ${running ? "is-running" : ""}`} aria-live="polite" aria-atomic="true">
        <span className={`status-dot ${running ? "active" : ""} ${isPending ? "pending" : ""}`} aria-hidden="true" />
        <div className="status-copy">
          <strong>{statusTitle}</strong>
          <span>{statusDetail}</span>
        </div>
      </section>

      <button
        className={`main-btn ${running ? "stop" : "start"}`}
        disabled={isLoading || isPending || (!running && (!isSupportedCall || activeTabId === null))}
        onClick={() => void handleToggleRunning()}
        aria-describedby="monitor-help"
      >
        {buttonLabel}
      </button>
      <p className="monitor-help" id="monitor-help">
        {running ? "Stop at any time from this menu." : "Sentinel only starts after you choose this button."}
      </p>

      {errorMsg && <div className="error-message" role="alert">{errorMsg}</div>}

      <section className="settings-section" aria-labelledby="settings-title">
        <div className="section-heading">
          <h2 id="settings-title">Detection settings</h2>
          <span>LOCAL</span>
        </div>
        <div className="settings-box">
          <div className="setting-row">
            <label htmlFor="sensitivity">Sensitivity</label>
            <select
              id="sensitivity"
              value={settings.sensitivity}
              onChange={(event) => void updateSettings({ sensitivity: event.target.value as Sensitivity })}
              disabled={isLoading}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <label className="setting-row setting-toggle" htmlFor="notifications">
            <span>System notifications</span>
            <span className="toggle-switch">
              <input
                id="notifications"
                type="checkbox"
                checked={settings.notifications}
                onChange={(event) => void updateSettings({ notifications: event.target.checked })}
                disabled={isLoading}
              />
              <span className="slider" aria-hidden="true" />
            </span>
          </label>

          <label className="setting-row setting-toggle" htmlFor="sound">
            <span>Alert sounds</span>
            <span className="toggle-switch">
              <input
                id="sound"
                type="checkbox"
                checked={settings.sound}
                onChange={(event) => void updateSettings({ sound: event.target.checked })}
                disabled={isLoading}
              />
              <span className="slider" aria-hidden="true" />
            </span>
          </label>
        </div>
      </section>

      {__SENTINEL_DEV__ && <details className="debug-settings">
        <summary>Debug and fallback mocks</summary>
        <div className="mock-group">
          {(["audio", "vision", "sync", "challenge"] as const).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={settings.useMock[key]}
                onChange={(event) => updateMock(key, event.target.checked)}
              />
              Use mock {key} module
            </label>
          ))}
        </div>
      </details>}

      <footer className="privacy-notice">
        <span className="privacy-mark" aria-hidden="true">●</span>
        <p>Call media is analyzed on this device. Sentinel does not upload call media.</p>
      </footer>
      <p className="prototype-note">Prototype signals are advisory; CLEAR does not verify who is on the call.</p>
    </main>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<PopupApp />);
