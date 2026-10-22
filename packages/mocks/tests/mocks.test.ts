import { describe, expect, it } from "vitest";
import { runContractSelfTest } from "@sentinel/contracts";
import {
  mockAudioDetector, mockChallengeVerifier, mockSyncDetector, mockTextClassifier, mockVisionDetector, scriptedScore,
} from "../src/index";

describe("scriptedScore", () => {
  it("follows the script", () => {
    expect(scriptedScore(0)).toBeCloseTo(0.1);
    expect(scriptedScore(25_000)).toBeCloseTo(0.45);
    expect(scriptedScore(40_000)).toBeCloseTo(0.8);
    expect(scriptedScore(55_000)).toBeCloseTo(0.45);
    expect(scriptedScore(70_000)).toBeCloseTo(0.1);
  });
});

describe("mocks pass the contract self-test", () => {
  it("all checks are ok", async () => {
    const results = await runContractSelfTest(
      { audio: mockAudioDetector(), vision: mockVisionDetector(), sync: mockSyncDetector(), challenge: mockChallengeVerifier(), text: mockTextClassifier() },
      {
        assetBase: "/",
        loadTestFace: async () => ({ __blank: false }) as unknown as ImageBitmap,
        loadBlankFrame: async () => ({ __blank: true }) as unknown as ImageBitmap,
      },
    );
    const failed = results.filter((r) => !r.ok);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
    expect(results.length).toBeGreaterThan(15);
  });
});
