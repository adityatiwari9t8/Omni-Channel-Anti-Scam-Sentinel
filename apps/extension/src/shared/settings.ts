import { DEFAULT_SETTINGS, type Settings } from "@sentinel/contracts";

const STORAGE_KEY = "sentinel_settings";

export async function loadSettings(): Promise<Settings> {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    if (data && data[STORAGE_KEY]) {
      return { ...DEFAULT_SETTINGS, ...data[STORAGE_KEY] };
    }
  } catch (err) {
    console.warn("[settings] Failed to load settings from storage:", err);
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  } catch (err) {
    console.error("[settings] Failed to save settings to storage:", err);
  }
}
