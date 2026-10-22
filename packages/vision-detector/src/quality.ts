import type { Point3 } from "./geometry";

const KEY = [1, 33, 263, 61, 291, 152, 10, 168];
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

export class LandmarkQuality {
  private previous: { points: Point3[]; center: Point3 } | null = null;
  reset(): void { this.previous = null; }
  measure(points: Point3[], faceHeightPx: number, frameWidth: number, frameHeight: number): number {
    if (!points.length || faceHeightPx <= 0) { this.reset(); return 0; }
    const keys = KEY.map((i) => points[i]).filter((p): p is Point3 => Boolean(p));
    if (keys.length < KEY.length) return 0;
    const normalize = (p: Point3): Point3 => ({ x: p.x * frameWidth / faceHeightPx, y: p.y * frameHeight / faceHeightPx });
    const normalized = keys.map(normalize);
    const center = { x: (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2 * frameWidth / faceHeightPx,
      y: (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2 * frameHeight / faceHeightPx };
    if (!this.previous) { this.previous = { points: normalized, center }; return 0.5; }
    const prev = this.previous;
    const dx = center.x - prev.center.x, dy = center.y - prev.center.y;
    const jitter = median(normalized.map((p, i) => Math.hypot((p.x - prev.points[i].x) - dx, (p.y - prev.points[i].y) - dy)));
    this.previous = { points: normalized, center };
    return clamp(1 - jitter / 0.03, 0, 1) * clamp(faceHeightPx / 80, 0, 1);
  }
}
