import type { ArbiterOutput } from "@sentinel/contracts";

export interface OverlayPresentation {
  className: string;
  status: string;
  summary: string;
  reasons: string;
  showAlert: boolean;
  showAcknowledge: boolean;
  showChallenge: boolean;
}

export function getOverlayPresentation(
  out: ArbiterOutput,
  acknowledged = false,
): OverlayPresentation {
  const noEvidence = out.state === "CLEAR" && out.fusedScore === null;
  const acknowledgedAlert = acknowledged && out.state === "ALERT";
  const acknowledgedClear = acknowledged && out.state === "CLEAR" && !noEvidence;

  let summary: string;
  if (noEvidence) {
    summary = "Not enough fresh call signals are available to assess this call.";
  } else if (acknowledgedAlert || acknowledgedClear) {
    summary = "Alert acknowledged. Monitoring continues; verify the caller through a trusted channel.";
  } else if (out.state === "ALERT") {
    summary = "Possible synthetic-media or liveness concerns detected. Verify the caller through a trusted channel.";
  } else if (out.state === "SUSPICIOUS") {
    summary = "Unusual signals need review. Treat this call with caution.";
  } else if (out.state === "CHALLENGE") {
    summary = "Complete the prompt below to add a liveness signal. This does not verify identity.";
  } else {
    summary = "No elevated risk signals in the latest samples. This does not verify identity.";
  }

  return {
    className: noEvidence
      ? "state-no-data"
      : acknowledgedAlert || acknowledgedClear
        ? "state-acknowledged"
        : `state-${out.state.toLowerCase()}`,
    status: noEvidence ? "NO DATA" : (acknowledgedAlert || acknowledgedClear ? "ACKNOWLEDGED" : out.state),
    summary,
    reasons: out.reasons.length > 0 ? out.reasons.join(" • ") : "No additional signal details.",
    showAlert: out.state === "ALERT" && !acknowledged,
    showAcknowledge: out.state === "ALERT" && !acknowledged,
    showChallenge: out.state === "CHALLENGE",
  };
}
