import type { ArbiterOutput, ChallengeType } from "@sentinel/contracts";
import overlayCss from "./overlay.inline.css";

export class SentinelOverlay {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private card: HTMLElement;
  private statusPill: HTMLElement;
  private statusText: HTMLElement;
  private reasonsEl: HTMLElement;
  private challengeBox: HTMLElement;
  private challengePrompt: HTMLElement;
  private challengeTimer: HTMLElement;
  private alertBanner: HTMLElement;

  private onDismissCallback?: () => void;
  private timerInterval?: number;

  constructor(onDismiss?: () => void) {
    this.onDismissCallback = onDismiss;

    this.host = document.createElement("div");
    this.host.id = "sentinel-extension-overlay-root";
    this.shadow = this.host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = overlayCss;
    this.shadow.appendChild(style);

    this.card = document.createElement("div");
    this.card.className = "sentinel-card state-clear";

    this.card.innerHTML = `
      <div class="sentinel-header">
        <div class="sentinel-title-row">
          <span class="sentinel-badge">Sentinel Shield</span>
        </div>
        <div class="sentinel-status-pill">
          <span class="dot"></span>
          <span class="status-label">CLEAR</span>
        </div>
      </div>
      <div class="sentinel-body">
        <div class="sentinel-reasons">Analyzing call streams...</div>
        <div class="sentinel-challenge-box" style="display: none;">
          <div class="challenge-prompt"></div>
          <div class="sentinel-challenge-timer"></div>
        </div>
        <div class="sentinel-alert-banner" style="display: none;">
          ⚠️ High probability of synthetic deepfake media on call.
        </div>
      </div>
      <div class="sentinel-actions">
        <button class="sentinel-btn dismiss-btn">Dismiss</button>
      </div>
    `;

    this.shadow.appendChild(this.card);
    document.body.appendChild(this.host);

    this.statusPill = this.card.querySelector(".sentinel-status-pill")!;
    this.statusText = this.card.querySelector(".status-label")!;
    this.reasonsEl = this.card.querySelector(".sentinel-reasons")!;
    this.challengeBox = this.card.querySelector(".sentinel-challenge-box")!;
    this.challengePrompt = this.card.querySelector(".challenge-prompt")!;
    this.challengeTimer = this.card.querySelector(".sentinel-challenge-timer")!;
    this.alertBanner = this.card.querySelector(".sentinel-alert-banner")!;

    const dismissBtn = this.card.querySelector(".dismiss-btn") as HTMLButtonElement;
    dismissBtn.addEventListener("click", () => {
      this.onDismissCallback?.();
    });
  }

  public update(out: ArbiterOutput): void {
    const state = out.state.toLowerCase();
    this.card.className = `sentinel-card state-${state}`;
    this.statusText.textContent = out.state;

    if (out.reasons && out.reasons.length > 0) {
      this.reasonsEl.textContent = out.reasons.join(" • ");
    } else {
      this.reasonsEl.textContent = "Call integrity verified.";
    }

    if (out.state === "ALERT") {
      this.alertBanner.style.display = "block";
    } else {
      this.alertBanner.style.display = "none";
    }

    if (out.state !== "CHALLENGE") {
      this.challengeBox.style.display = "none";
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = undefined;
      }
    }
  }

  public showChallenge(challenge: ChallengeType, prompt: string, deadlineMs: number): void {
    this.challengeBox.style.display = "block";
    this.challengePrompt.textContent = prompt;

    if (this.timerInterval) clearInterval(this.timerInterval);

    const updateTimer = () => {
      const remainingSec = Math.max(0, Math.ceil((deadlineMs - (performance.timeOrigin + performance.now())) / 1000));
      this.challengeTimer.textContent = `Time remaining: ${remainingSec}s`;
      if (remainingSec <= 0 && this.timerInterval) {
        clearInterval(this.timerInterval);
      }
    };

    updateTimer();
    this.timerInterval = window.setInterval(updateTimer, 500);
  }

  public destroy(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.host.remove();
  }
}
