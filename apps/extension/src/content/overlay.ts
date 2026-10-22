import type { ArbiterOutput, ChallengeType } from "@sentinel/contracts";
import overlayCss from "./overlay.inline.css";
import { getOverlayPresentation } from "./overlay-view";

export class SentinelOverlay {
  private host: HTMLElement;
  private card: HTMLElement;
  private statusText: HTMLElement;
  private summaryEl: HTMLElement;
  private reasonsEl: HTMLElement;
  private challengeBox: HTMLElement;
  private challengePrompt: HTMLElement;
  private challengeTimer: HTMLElement;
  private alertBanner: HTMLElement;
  private acknowledgeButton: HTMLButtonElement;

  private onAcknowledge?: () => void;
  private timerInterval?: number;
  private latestOutput: ArbiterOutput | null = null;
  private acknowledged = false;
  private lastState: ArbiterOutput["state"] | null = null;

  constructor(onAcknowledge?: () => void) {
    this.onAcknowledge = onAcknowledge;

    this.host = document.createElement("div");
    this.host.id = "sentinel-extension-overlay-root";
    const shadow = this.host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = overlayCss;
    shadow.appendChild(style);

    this.card = document.createElement("div");
    this.card.className = "sentinel-card state-no-data";
    this.card.setAttribute("role", "region");
    this.card.setAttribute("aria-label", "Sentinel call integrity status");

    this.card.innerHTML = `
      <header class="sentinel-header">
        <div class="sentinel-brand">
          <span class="sentinel-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false"><path d="M12 2.7 20 6v5.2c0 5.1-3.4 8.3-8 10.1-4.6-1.8-8-5-8-10.1V6l8-3.3Z"/><path d="m8.6 12.1 2.2 2.2 4.7-4.8"/></svg>
          </span>
          <span class="sentinel-brand-name">Sentinel</span>
        </div>
        <div class="sentinel-status-pill" aria-live="polite" aria-atomic="true">
          <span class="dot" aria-hidden="true"></span>
          <span class="status-label">NO DATA</span>
        </div>
      </header>
      <div class="sentinel-body">
        <p class="sentinel-summary">Waiting for fresh call signals.</p>
        <div class="sentinel-evidence-label">Signals</div>
        <p class="sentinel-reasons">Not enough data</p>
        <div class="sentinel-challenge-box" hidden>
          <div class="sentinel-challenge-title">Liveness prompt</div>
          <div class="challenge-prompt"></div>
          <div class="sentinel-challenge-timer" role="timer" aria-live="off"></div>
        </div>
        <div class="sentinel-alert-banner" role="alert" aria-live="assertive" hidden>
          <span class="sentinel-warning-icon" aria-hidden="true">!</span>
          <div>
            <strong>Possible synthetic-media or liveness concerns detected.</strong>
            <span> Treat this as an advisory signal, not proof. Verify the caller through a trusted channel.</span>
          </div>
        </div>
      </div>
      <footer class="sentinel-footer">
        <span class="sentinel-disclaimer">A risk signal cannot verify identity.</span>
        <button class="sentinel-btn acknowledge-btn" type="button" hidden>Acknowledge</button>
      </footer>
    `;

    shadow.appendChild(this.card);
    document.body.appendChild(this.host);

    this.statusText = this.card.querySelector<HTMLElement>(".status-label")!;
    this.summaryEl = this.card.querySelector<HTMLElement>(".sentinel-summary")!;
    this.reasonsEl = this.card.querySelector<HTMLElement>(".sentinel-reasons")!;
    this.challengeBox = this.card.querySelector<HTMLElement>(".sentinel-challenge-box")!;
    this.challengePrompt = this.card.querySelector<HTMLElement>(".challenge-prompt")!;
    this.challengeTimer = this.card.querySelector<HTMLElement>(".sentinel-challenge-timer")!;
    this.alertBanner = this.card.querySelector<HTMLElement>(".sentinel-alert-banner")!;
    this.acknowledgeButton = this.card.querySelector<HTMLButtonElement>(".acknowledge-btn")!;

    this.acknowledgeButton.addEventListener("click", () => {
      this.acknowledged = true;
      if (this.latestOutput) this.render(this.latestOutput);
      this.onAcknowledge?.();
    });
  }

  public update(out: ArbiterOutput): void {
    if (this.acknowledged && out.state === "ALERT" && this.lastState !== "ALERT") {
      this.acknowledged = false;
    }
    this.lastState = out.state;
    this.latestOutput = out;
    this.render(out);
  }

  private render(out: ArbiterOutput): void {
    const view = getOverlayPresentation(out, this.acknowledged);
    this.card.className = `sentinel-card ${view.className}`;
    this.statusText.textContent = view.status;
    this.summaryEl.textContent = view.summary;
    this.reasonsEl.textContent = view.reasons;
    this.alertBanner.hidden = !view.showAlert;
    this.acknowledgeButton.hidden = !view.showAcknowledge;
    this.challengeBox.hidden = !view.showChallenge;

    if (!view.showChallenge && this.timerInterval !== undefined) {
      clearInterval(this.timerInterval);
      this.timerInterval = undefined;
    }
  }

  public showChallenge(challenge: ChallengeType, prompt: string, deadlineMs: number): void {
    this.challengeBox.hidden = false;
    this.challengeBox.dataset.challenge = challenge;
    this.challengePrompt.textContent = prompt;

    if (this.timerInterval !== undefined) clearInterval(this.timerInterval);

    const updateTimer = () => {
      const remainingSec = Math.max(0, Math.ceil((deadlineMs - (performance.timeOrigin + performance.now())) / 1000));
      this.challengeTimer.textContent = `Time remaining: ${remainingSec}s`;
      if (remainingSec <= 0 && this.timerInterval !== undefined) {
        clearInterval(this.timerInterval);
        this.timerInterval = undefined;
      }
    };

    updateTimer();
    this.timerInterval = window.setInterval(updateTimer, 500);
  }

  public destroy(): void {
    if (this.timerInterval !== undefined) clearInterval(this.timerInterval);
    this.host.remove();
  }
}
