export function isSupportedCallUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return hostname === "meet.google.com" || hostname === "zoom.us" || hostname.endsWith(".zoom.us");
  } catch {
    return false;
  }
}
