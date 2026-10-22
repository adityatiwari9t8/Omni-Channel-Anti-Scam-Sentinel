import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_SETTINGS,
  type PopupToSw,
  type Sensitivity,
  type Settings,
  type SwState,
} from "@sentinel/contracts";

export function PopupApp() {
  const [running, setRunning] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [isSupportedCall, setIsSupportedCall] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // 1. Fetch current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id) {
        setActiveTabId(tab.id);
        const url = tab.url || "";
        const supported = url.includes("meet.google.com") || url.includes("zoom.us");
        setIsSupportedCall(supported);
      }
    });

    // 2. Fetch service worker state
    chrome.runtime.sendMessage({ v: 1, t: "GET_STATE" } satisfies PopupToSw, (res: SwState) => {
      if (res) {
        setRunning(res.running);
        if (res.settings) {
          setSettings(res.settings);
        }
      }
    });
  }, []);

  const handleToggleRunning = async () => {
    setErrorMsg(null);
    if (!running) {
      if (!activeTabId) return;
      chrome.runtime.sendMessage(
        { v: 1, t: "START", tabId: activeTabId } satisfies PopupToSw,
        (res) => {
          if (res?.ok) {
            setRunning(true);
          } else {
            setErrorMsg(res?.error || "Failed to start capture");
          }
        },
      );
    } else {
      chrome.runtime.sendMessage({ v: 1, t: "STOP" } satisfies PopupToSw, (res) => {
        if (res?.ok) {
          setRunning(false);
        }
      });
    }
  };

  const updateSettings = (partial: Partial<Settings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    chrome.runtime.sendMessage({
      v: 1,
      t: "SET_SETTINGS",
      settings: updated,
    } satisfies PopupToSw);
  };

  const updateMock = (key: keyof Settings["useMock"], val: boolean) => {
    const updatedMocks = { ...settings.useMock, [key]: val };
    updateSettings({ useMock: updatedMocks });
  };

  return (
    <div className="popup-container">
      <div className="popup-header">
        <div className="logo-group">
          <div className="logo-icon">S</div>
          <span className="logo-text">Sentinel</span>
        </div>
        <span className="version-pill">v0.1.0</span>
      </div>

      <div className="status-card">
        <div className="status-left">
          <div className={`status-dot ${running ? "active" : ""}`} />
          <span className="status-text">{running ? "Monitoring Live Call" : "Standby"}</span>
        </div>
      </div>

      <button
        className={`main-btn ${running ? "stop" : "start"}`}
        disabled={!running && !isSupportedCall}
        onClick={handleToggleRunning}
      >
        {running ? "Stop Monitoring" : isSupportedCall ? "Start Monitoring" : "Join Meet or Zoom to Start"}
      </button>

      {errorMsg && <div style={{ color: "#ef4444", fontSize: 11 }}>{errorMsg}</div>}

      <div className="settings-section">
        <div className="section-label">Detection Settings</div>
        <div className="settings-box">
          <div className="setting-row">
            <span>Sensitivity</span>
            <select
              value={settings.sensitivity}
              onChange={(e) => updateSettings({ sensitivity: e.target.value as Sensitivity })}
            >
              <option value="low">Low (Conservative)</option>
              <option value="medium">Medium (Standard)</option>
              <option value="high">High (Strict)</option>
            </select>
          </div>

          <div className="setting-row">
            <span>System Notifications</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.notifications}
                onChange={(e) => updateSettings({ notifications: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>

          <div className="setting-row">
            <span>Alert Sounds</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={settings.sound}
                onChange={(e) => updateSettings({ sound: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>
        </div>
      </div>

      <details>
        <summary>Debug & Fallback Mocks</summary>
        <div className="mock-group">
          <label>
            <input
              type="checkbox"
              checked={settings.useMock.audio}
              onChange={(e) => updateMock("audio", e.target.checked)}
            />{" "}
            Mock Audio Detector
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.useMock.vision}
              onChange={(e) => updateMock("vision", e.target.checked)}
            />{" "}
            Mock Vision Detector
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.useMock.sync}
              onChange={(e) => updateMock("sync", e.target.checked)}
            />{" "}
            Mock Sync Detector
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.useMock.challenge}
              onChange={(e) => updateMock("challenge", e.target.checked)}
            />{" "}
            Mock Challenge Verifier
          </label>
        </div>
      </details>

      <div className="privacy-notice">
        🔒 Audio and video streams are processed completely on your device. Zero data ever leaves your computer.
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<PopupApp />);
