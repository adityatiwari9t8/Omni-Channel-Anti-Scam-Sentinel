import { describe, expect, it } from "vitest";
import { isSupportedCallUrl } from "../shared/meeting-url";

describe("supported meeting URLs", () => {
  it("accepts Google Meet and Zoom Web HTTPS hosts", () => {
    expect(isSupportedCallUrl("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isSupportedCallUrl("https://zoom.us/j/123456789")).toBe(true);
    expect(isSupportedCallUrl("https://us02web.zoom.us/j/123456789")).toBe(true);
  });

  it("rejects lookalike hosts, insecure schemes, and malformed values", () => {
    expect(isSupportedCallUrl("https://meet.google.com.attacker.example/")).toBe(false);
    expect(isSupportedCallUrl("https://notzoom.us/")).toBe(false);
    expect(isSupportedCallUrl("https://zoom.us.attacker.example/")).toBe(false);
    expect(isSupportedCallUrl("http://meet.google.com/")).toBe(false);
    expect(isSupportedCallUrl("not a URL")).toBe(false);
  });
});
