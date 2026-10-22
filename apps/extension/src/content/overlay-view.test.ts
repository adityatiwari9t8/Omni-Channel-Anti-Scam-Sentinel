import { describe, expect, it } from "vitest";
import type { ArbiterOutput } from "@sentinel/contracts";
import { getOverlayPresentation } from "./overlay-view";

function output(state: ArbiterOutput["state"], fusedScore: number | null): ArbiterOutput {
  return { tsMs: 1, state, fusedScore, reasons: [] };
}

describe("overlay presentation", () => {
  it("makes missing evidence explicit instead of calling the call verified", () => {
    const view = getOverlayPresentation(output("CLEAR", null));
    expect(view.status).toBe("NO DATA");
    expect(view.summary).toMatch(/not enough fresh call signals/i);
    expect(view.summary).not.toMatch(/verified/i);
  });

  it("describes clear as a limited signal, not identity verification", () => {
    const view = getOverlayPresentation(output("CLEAR", 0.12));
    expect(view.status).toBe("CLEAR");
    expect(view.summary).toMatch(/does not verify identity/i);
  });

  it("uses advisory wording for alerts and exposes the acknowledge action", () => {
    const view = getOverlayPresentation(output("ALERT", 0.91));
    expect(view.summary).toMatch(/possible synthetic-media/i);
    expect(view.summary).toMatch(/trusted channel/i);
    expect(view.showAlert).toBe(true);
    expect(view.showAcknowledge).toBe(true);
  });

  it("acknowledges an alert without presenting it as a clear verification", () => {
    const view = getOverlayPresentation(output("ALERT", 0.91), true);
    expect(view.status).toBe("ACKNOWLEDGED");
    expect(view.showAlert).toBe(false);
    expect(view.showAcknowledge).toBe(false);
    expect(view.summary).toMatch(/monitoring continues/i);
  });
});
