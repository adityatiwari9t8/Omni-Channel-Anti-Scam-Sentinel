import { describe, expect, it } from "vitest";
import { constantYawFrames, makeFrame, yawSweepFrames } from "@sentinel/contracts";
import { createChallengeVerifier } from "../src/index";

describe("ChallengeVerifier", () => {
  it("passes a clean bilateral turn and scores a quality collapse", () => {
    const v = createChallengeVerifier();
    expect(v.poll()).toBeNull();
    v.start("turn_head_left_right", 0);
    yawSweepFrames(0, 5).forEach((f) => v.pushFrame(f));
    expect(v.poll()).toMatchObject({ state: "passed", artifactScore: 0 });
    v.cancel();
    v.start("turn_head_left_right", 10000);
    yawSweepFrames(10000, 5, 10, 35, true).forEach((f) => v.pushFrame(f));
    expect(v.poll()!.artifactScore).toBeGreaterThan(0.5);
  });
  it("fails constant yaw after timestamp-based timeout", () => {
    const v = createChallengeVerifier();
    v.start("turn_head_left_right", 0);
    constantYawFrames(0, 13).forEach((f) => v.pushFrame(f));
    expect(v.poll()).toMatchObject({ state: "failed" });
  });
  it("requires cover for 800 ms and subsequent face recovery", () => {
    const v = createChallengeVerifier(); v.start("cover_half_face", 0);
    for (let i = 0; i <= 9; i++) v.pushFrame(makeFrame(i * 100, { faceOccluded: true }));
    expect(v.poll()?.state).toBe("pending");
    v.pushFrame(makeFrame(1000));
    expect(v.poll()?.state).toBe("passed");
  });
  it("supports fingers with hand tracking and cancel clears state", () => {
    const v = createChallengeVerifier(); v.start("raise_fingers", 0);
    for (let i = 0; i <= 11; i++) v.pushFrame(makeFrame(i * 100, { handNearFace: true }));
    expect(v.poll()?.state).toBe("passed");
    v.cancel(); expect(v.poll()).toBeNull();
  });
});
