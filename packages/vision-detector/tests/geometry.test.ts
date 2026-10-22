import { describe, expect, it } from "vitest";
import { faceBox, handGeometry, largestFaceIndex, mouthAperture, poseFromMatrix } from "../src/geometry";
import { LandmarkQuality } from "../src/quality";

const landmarks = (cx = 0.5, size = 0.4) => {
  const p = Array.from({ length: 478 }, () => ({ x: cx, y: 0.5 }));
  p[10] = { x: cx, y: 0.5 - size * 0.75 }; p[152] = { x: cx, y: 0.5 + size * 0.75 };
  p[13] = { x: cx, y: 0.5 }; p[14] = { x: cx, y: 0.5 + size * 0.15 };
  p[33] = { x: cx - size * 0.25, y: 0.4 }; p[263] = { x: cx + size * 0.25, y: 0.4 };
  p[61] = { x: cx - size * 0.125, y: 0.5 }; p[291] = { x: cx + size * 0.125, y: 0.5 }; p[1] = { x: cx, y: 0.46 }; p[168] = { x: cx, y: 0.35 };
  return p;
};

describe("vision geometry", () => {
  it("normalizes mouth gap by face height and uses pixel aspect ratio", () => {
    expect(mouthAperture(landmarks(), 480, 480)).toBeCloseTo(0.1);
    expect(mouthAperture(landmarks(), 480, 480)).toBe(mouthAperture(landmarks(), 960, 960));
  });
  it("selects the largest face and calculates hand overlap", () => {
    expect(largestFaceIndex([landmarks(0.2), landmarks(0.5, 0.8)], 480, 480)).toBe(1);
    const face = faceBox(landmarks(), 480, 480)!;
    const hand = [{ x: 0.45, y: 0.4 }, { x: 0.55, y: 0.4 }, { x: 0.55, y: 0.6 }, { x: 0.45, y: 0.6 }];
    expect(handGeometry([hand], 480, 480, face).near).toBe(true);
    expect(handGeometry([hand], 480, 480, face).coverage).toBeGreaterThan(0.15);
  });
  it("extracts finite pose angles from a rigid identity matrix", () => {
    const pose = poseFromMatrix({ data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] });
    expect(pose).toEqual({ yawDeg: 0, pitchDeg: 0, rollDeg: 0 });
  });
  it("quality is 0.5 on first observation, then high for stable landmarks", () => {
    const q = new LandmarkQuality();
    const p = landmarks();
    expect(q.measure(p, 120, 480, 270)).toBeCloseTo(0.5);
    expect(q.measure(p, 120, 480, 270)).toBe(1);
  });
});
