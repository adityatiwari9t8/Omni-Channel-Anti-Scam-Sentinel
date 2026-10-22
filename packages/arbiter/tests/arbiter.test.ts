import { describe, expect, it } from "vitest";
import { createArbiter } from "../src/index";
import type { AudioResult, SyncResult } from "@sentinel/contracts";

function fakeAudio(score: number, conf = 0.9): AudioResult {
  return {
    windowStartMs: 0,
    windowEndMs: 4000,
    scoreFake: score,
    confidence: conf,
    latencyMs: 10,
  };
}

function fakeSync(score: number, conf = 0.9): SyncResult {
  return {
    tsMs: 0,
    scoreFake: score,
    confidence: conf,
    correlation: 0.8,
    windowMs: 4000,
  };
}

describe("Arbiter", () => {
  it("no data stays CLEAR with null fusedScore", () => {
    const arb = createArbiter();
    const out = arb.tick(1000);
    expect(out.state).toBe("CLEAR");
    expect(out.fusedScore).toBeNull();
    expect(out.reasons).toContain("Not enough data");
  });

  it("sustained high scores escalate in order (CLEAR -> SUSPICIOUS -> CHALLENGE -> ALERT)", () => {
    const arb = createArbiter();
    arb.onAudio(fakeAudio(0.85));
    arb.onSync(fakeSync(0.85));

    // t = 0ms: starts in CLEAR
    let out = arb.tick(0);
    expect(out.state).toBe("CLEAR");

    // t = 3100ms: enters SUSPICIOUS (> 3000ms dwell)
    out = arb.tick(3100);
    expect(out.state).toBe("SUSPICIOUS");

    // t = 8200ms: enters CHALLENGE (> 5000ms challenge dwell above 0.65)
    out = arb.tick(8200);
    expect(out.state).toBe("CHALLENGE");
    expect(out.challenge).toBeDefined();

    // t = 11300ms: enters ALERT (> 3000ms alert dwell above 0.80)
    out = arb.tick(11300);
    expect(out.state).toBe("ALERT");
  });

  it("flicker around threshold does not change state (hysteresis)", () => {
    const arb = createArbiter();
    arb.onAudio(fakeAudio(0.55));
    arb.onSync(fakeSync(0.55));

    arb.tick(0);
    let out = arb.tick(3100);
    expect(out.state).toBe("SUSPICIOUS");

    // Score flickers slightly below threshold (0.45) but above exit threshold (0.40)
    arb.onAudio(fakeAudio(0.45));
    arb.onSync(fakeSync(0.45));
    out = arb.tick(3500);
    expect(out.state).toBe("SUSPICIOUS");

    // Score drops low and sustains for long enough that EMA decays below 0.40
    arb.onAudio(fakeAudio(0.1));
    arb.onSync(fakeSync(0.1));
    out = arb.tick(20000);
    expect(out.state).toBe("CLEAR");
  });

  it("a failed challenge goes to ALERT", () => {
    const arb = createArbiter();
    arb.onAudio(fakeAudio(0.7));
    arb.onSync(fakeSync(0.7));
    arb.tick(0);
    arb.tick(3100);
    const outChallenge = arb.tick(8200);
    expect(outChallenge.state).toBe("CHALLENGE");

    // Verifier reports failed
    arb.onChallenge({
      challenge: outChallenge.challenge!,
      state: "failed",
      artifactScore: 0.1,
      evidence: "Failed movement",
    });

    const outAlert = arb.tick(8300);
    expect(outAlert.state).toBe("ALERT");
  });

  it("a passed challenge de-escalates", () => {
    const arb = createArbiter();
    arb.onAudio(fakeAudio(0.7));
    arb.onSync(fakeSync(0.7));
    arb.tick(0);
    arb.tick(3100);
    const outChallenge = arb.tick(8200);
    expect(outChallenge.state).toBe("CHALLENGE");

    // Natural caller with low scores
    arb.onAudio(fakeAudio(0.1));
    arb.onSync(fakeSync(0.1));
    arb.tick(20000);

    arb.onChallenge({
      challenge: outChallenge.challenge!,
      state: "passed",
      artifactScore: 0.05,
      evidence: "Passed successfully",
    });

    const out = arb.tick(20100);
    expect(out.state).toBe("CLEAR");
  });

  it("dismiss cooldown works", () => {
    const arb = createArbiter();
    arb.onAudio(fakeAudio(0.85));
    arb.onSync(fakeSync(0.85));
    arb.tick(0);
    arb.tick(3100);
    arb.tick(8200);
    let out = arb.tick(12000);
    expect(out.state).toBe("ALERT");

    // User dismisses
    arb.dismiss(12100);
    out = arb.tick(12100);
    expect(out.state).toBe("CLEAR");

    // Within 60s cooldown, it stays CLEAR despite high scores
    out = arb.tick(30000);
    expect(out.state).toBe("CLEAR");
  });
});
