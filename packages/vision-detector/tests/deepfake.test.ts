import { describe, expect, it } from "vitest";
import { computeFaceCropRect, fakeScoreFromLogit, FRAME_CLASSIFIER_PREPROCESSING, normalizeRgbaToChw } from "../src/deepfake";

describe("frame-classifier adapter contract", () => {
  it("keeps the model's crop and input tensor recipe explicit", () => {
    expect(FRAME_CLASSIFIER_PREPROCESSING).toMatchObject({
      inputSize: 384,
      resizeSize: 440,
      inputShape: [1, 3, 384, 384],
      colorOrder: "RGB",
      tensorLayout: "NCHW",
    });
    expect(computeFaceCropRect(640, 480, { x0: 200, y0: 100, x1: 300, y1: 250 })).toEqual({ x: 153, y: 78, side: 195 });
    expect(computeFaceCropRect(640, 480, { x0: 0, y0: 0, x1: 120, y1: 160 })).toEqual({ x: 0, y: 0, side: 208 });
  });

  it("converts RGBA pixels to normalized RGB channel-first values", () => {
    const actual = normalizeRgbaToChw(new Uint8ClampedArray([255, 0, 0, 255]));
    expect(actual).toHaveLength(3);
    expect(actual[0]).toBeCloseTo((1 - 0.4815) / 0.2686, 5);
    expect(actual[1]).toBeCloseTo((0 - 0.4578) / 0.2613, 5);
    expect(actual[2]).toBeCloseTo((0 - 0.4082) / 0.2758, 5);
    expect(() => normalizeRgbaToChw([1, 2, 3])).toThrow("divisible by four");
  });

  it("maps the model's single synthetic-class logit into a finite score", () => {
    expect(fakeScoreFromLogit(0)).toBe(0.5);
    expect(fakeScoreFromLogit(2)).toBeCloseTo(0.8808, 4);
    expect(fakeScoreFromLogit(-2)).toBeCloseTo(0.1192, 4);
    expect(() => fakeScoreFromLogit(Number.NaN)).toThrow("non-finite");
  });
});
