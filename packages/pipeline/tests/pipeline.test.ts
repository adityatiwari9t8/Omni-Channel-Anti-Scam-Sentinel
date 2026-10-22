import { describe, expect, it, vi } from "vitest";
import { createPipeline } from "../src/index";
import { createArbiter } from "@sentinel/arbiter";
import {
  mockAudioDetector,
  mockChallengeVerifier,
  mockSyncDetector,
  mockVisionDetector,
} from "@sentinel/mocks";
import type { FrameResult } from "@sentinel/contracts";

describe("Pipeline", () => {
  it("processes audio and frames, invoking arbiter and listeners", async () => {
    const audio = mockAudioDetector();
    const vision = mockVisionDetector();
    const sync = mockSyncDetector();
    const challenge = mockChallengeVerifier();
    const arbiter = createArbiter();

    const logged: any[] = [];
    const pipeline = createPipeline(
      { audio, vision, sync, challenge, arbiter },
      { logger: (line) => logged.push(line) },
    );

    await pipeline.start({ assetBase: "/" });

    const updates: any[] = [];
    pipeline.onUpdate((u) => updates.push(u));

    // Push audio chunk (1600 samples)
    const chunk = new Float32Array(1600);
    pipeline.pushAudio(chunk, 1000);

    // Push frame
    const fakeFrame = { __blank: true } as unknown as ImageBitmap;
    await pipeline.pushFrame(fakeFrame, 1000);

    expect(updates.length).toBeGreaterThanOrEqual(1);
    expect(logged.length).toBeGreaterThanOrEqual(1);
    expect(logged[0]).toHaveProperty("ts");
    expect(logged[0]).toHaveProperty("out");
    expect(logged[0]).toHaveProperty("droppedAudioCount");

    pipeline.stop();
  });

  it("drops audio chunks when audio processing is backed up", async () => {
    let resolveAudio: (res: any) => void;
    const slowAudio = {
      isMock: true,
      init: async () => {},
      push: () => new Promise((resolve) => { resolveAudio = resolve; }),
      dispose: () => {},
    };

    const vision = mockVisionDetector();
    const sync = mockSyncDetector();
    const challenge = mockChallengeVerifier();
    const arbiter = createArbiter();

    const pipeline = createPipeline({
      audio: slowAudio as any,
      vision,
      sync,
      challenge,
      arbiter,
    });

    await pipeline.start({ assetBase: "/" });

    // Push 1st chunk -> starts processing
    pipeline.pushAudio(new Float32Array(1600), 100);
    // Push 2nd chunk -> becomes pending
    pipeline.pushAudio(new Float32Array(1600), 200);
    // Push 3rd chunk -> causes 2nd chunk to be dropped!
    pipeline.pushAudio(new Float32Array(1600), 300);
    // Push 4th chunk -> causes 3rd chunk to be dropped!
    pipeline.pushAudio(new Float32Array(1600), 400);

    expect(pipeline.getDroppedAudioCount()).toBe(2);

    pipeline.stop();
  });

  it("starts challenge when entering CHALLENGE state and cancels when leaving", async () => {
    const audio = mockAudioDetector();
    const vision = mockVisionDetector();
    const sync = mockSyncDetector();
    const challenge = mockChallengeVerifier();
    const startSpy = vi.spyOn(challenge, "start");
    const cancelSpy = vi.spyOn(challenge, "cancel");

    // Custom arbiter that switches to CHALLENGE then CLEAR
    let currentState: any = "CLEAR";
    const customArbiter: any = {
      onAudio: () => {},
      onFrame: () => {},
      onSync: () => {},
      onChallenge: () => {},
      tick: (tsMs: number) => ({
        tsMs,
        state: currentState,
        fusedScore: 0.8,
        reasons: [],
        challenge: currentState === "CHALLENGE" ? "turn_head_left_right" : undefined,
      }),
      setSensitivity: () => {},
      reset: () => {},
    };

    const pipeline = createPipeline({
      audio,
      vision,
      sync,
      challenge,
      arbiter: customArbiter,
    });

    await pipeline.start({ assetBase: "/" });

    const fakeFrame = { __blank: true } as unknown as ImageBitmap;

    // Trigger tick in CLEAR
    await pipeline.pushFrame(fakeFrame, 1000);
    expect(startSpy).not.toHaveBeenCalled();

    // Switch to CHALLENGE
    currentState = "CHALLENGE";
    await pipeline.pushFrame(fakeFrame, 2000);
    expect(startSpy).toHaveBeenCalledWith("turn_head_left_right", 2000);

    // Switch to ALERT
    currentState = "ALERT";
    await pipeline.pushFrame(fakeFrame, 3000);
    expect(cancelSpy).toHaveBeenCalled();

    pipeline.stop();
  });
});
