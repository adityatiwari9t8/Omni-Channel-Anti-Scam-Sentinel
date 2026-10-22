import type { ArbiterOutput, AudioResult, ChallengeType, FrameResult, Ms, Settings, SyncResult } from "./types";

export const PORT_MEET = "sentinel-meet";

/** popup -> service worker (chrome.runtime.sendMessage). Always include v: 1. */
export type PopupToSw =
  | { v: 1; t: "START"; tabId: number }
  | { v: 1; t: "STOP" }
  | { v: 1; t: "GET_STATE" }
  | { v: 1; t: "SET_SETTINGS"; settings: Settings };
export interface SwState { running: boolean; tabId: number | null; settings: Settings; error?: string }

/** service worker -> offscreen document (chrome.runtime.sendMessage, target must be "offscreen"). */
export type SwToOffscreen =
  | { v: 1; target: "offscreen"; t: "OFFSCREEN_START"; streamId: string; settings: Settings }
  | { v: 1; target: "offscreen"; t: "OFFSCREEN_STOP" }
  | { v: 1; target: "offscreen"; t: "SETTINGS"; settings: Settings };

/** service worker -> Meet content script (chrome.tabs.sendMessage). */
export type SwToContent =
  | { v: 1; t: "MEET_START"; settings: Settings }
  | { v: 1; t: "MEET_STOP" };

/** Meet content script -> offscreen, over the port named PORT_MEET. */
export type ContentToOffscreen =
  | { v: 1; t: "HELLO" }
  | { v: 1; t: "FRAME"; jpegB64: string; w: number; h: number; tsMs: Ms }
  | { v: 1; t: "VIDEO_LOST" }
  | { v: 1; t: "USER_DISMISS" };

/** offscreen -> Meet content script, over the same port. */
export type OffscreenToContent =
  | { v: 1; t: "UPDATE"; out: ArbiterOutput; audio: AudioResult | null; sync: SyncResult | null; frame: FrameResult | null }
  | { v: 1; t: "CHALLENGE"; challenge: ChallengeType; prompt: string; deadlineMs: Ms }
  | { v: 1; t: "STATUS"; running: boolean; note?: string };

export const CHALLENGE_PROMPTS: Record<ChallengeType, string> = {
  turn_head_left_right: "Ask the caller to slowly turn their head left, then right.",
  cover_half_face: "Ask the caller to cover half of their face with their hand.",
  raise_fingers: "Ask the caller to hold up three fingers next to their face.",
};
