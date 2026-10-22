import { describe, expect, it } from "vitest";
import { makeVisionDetector } from "../src/detector";
import type { Landmarkers } from "../src/landmarker";

const points = Array.from({ length: 478 }, (_, i) => ({ x: 0.5 + Math.sin(i) * 0.1, y: 0.5 + Math.cos(i) * 0.15 }));
const fakeLandmarkers = (empty = false, onTs?: (ts: number) => void): Landmarkers => ({
  backend: "CPU",
  face: { detectForVideo: (_frame, ts) => { onTs?.(ts); return { faceLandmarks: empty ? [] : [points], facialTransformationMatrixes: [{ data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }] }; }, close() {} },
  hands: null,
});
const frame = { width: 480, height: 270 } as ImageBitmap;

describe("VisionDetector", () => {
  it("returns the no-face contract and never throws on detection errors", async () => {
    const d = makeVisionDetector(async () => fakeLandmarkers(true), false);
    await d.init({ assetBase: "/" });
    expect(await d.processFrame(frame, 1)).toMatchObject({ faceFound: false, mouthAperture: 0, landmarkQuality: 0 });
    d.dispose(); d.dispose();
    const broken = makeVisionDetector(async () => ({ backend: "CPU", face: { detectForVideo() { throw Error("bad frame"); }, close() {} }, hands: null }), false);
    await broken.init({ assetBase: "/" });
    expect((await broken.processFrame(frame, 1)).faceFound).toBe(false);
    expect(broken.errors).toBe(1);
  });
  it("keeps MediaPipe timestamps strictly increasing and emits finite measurements", async () => {
    const seen: number[] = [];
    const d = makeVisionDetector(async () => fakeLandmarkers(false, (ts) => seen.push(ts)), false);
    await d.init({ assetBase: "/" });
    const a = await d.processFrame(frame, 5), b = await d.processFrame(frame, 5);
    expect(seen).toEqual([5, 6]);
    expect(a.faceFound).toBe(true);
    expect(Number.isFinite(a.mouthAperture)).toBe(true);
    expect(Number.isFinite(b.latencyMs)).toBe(true);
  });
});
