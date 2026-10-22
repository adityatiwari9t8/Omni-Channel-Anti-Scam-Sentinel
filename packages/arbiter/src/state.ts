import type {
  ArbiterOutput,
  ArbiterState,
  ChallengeStatus,
  ChallengeType,
  Ms,
  Score01,
  Sensitivity,
} from "@sentinel/contracts";
import type { ArbiterConfig } from "./config";

export class ArbiterStateMachine {
  private state: ArbiterState = "CLEAR";
  private currentChallenge?: ChallengeType;
  private challengeDeadlineMs?: Ms;
  private lastChallenge?: ChallengeType;

  // Dwell timers
  private suspiciousEnterMs: Ms | null = null;
  private challengeEnterMs: Ms | null = null;
  private alertScoreEnterMs: Ms | null = null;
  private alertLowScoreEnterMs: Ms | null = null;
  private lastDismissMs: Ms | null = null;

  constructor(
    private cfg: ArbiterConfig,
    private sensitivity: Sensitivity = "medium",
  ) {}

  public setSensitivity(s: Sensitivity) {
    this.sensitivity = s;
  }

  public getState(): ArbiterState {
    return this.state;
  }

  public dismiss(nowMs: Ms) {
    if (this.state === "ALERT") {
      this.state = "CLEAR";
      this.lastDismissMs = nowMs;
      this.currentChallenge = undefined;
      this.challengeDeadlineMs = undefined;
      this.suspiciousEnterMs = null;
      this.challengeEnterMs = null;
      this.alertScoreEnterMs = null;
      this.alertLowScoreEnterMs = null;
    }
  }

  public reset() {
    this.state = "CLEAR";
    this.currentChallenge = undefined;
    this.challengeDeadlineMs = undefined;
    this.suspiciousEnterMs = null;
    this.challengeEnterMs = null;
    this.alertScoreEnterMs = null;
    this.alertLowScoreEnterMs = null;
    this.lastDismissMs = null;
  }

  private pickNextChallenge(): ChallengeType {
    const all: ChallengeType[] = ["turn_head_left_right", "cover_half_face", "raise_fingers"];
    const candidates = all.filter((c) => c !== this.lastChallenge);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)] ?? "turn_head_left_right";
    this.lastChallenge = chosen;
    return chosen;
  }

  public update(
    smoothedScore: Score01 | null,
    challengeStatus: ChallengeStatus | null,
    nowMs: Ms,
    reasons: string[],
  ): ArbiterOutput {
    const thresholds = this.cfg.thresholds[this.sensitivity];
    const { suspicious, challenge, alert } = thresholds;
    const exitClear = suspicious - this.cfg.hysteresis;

    const inDismissCooldown =
      this.lastDismissMs !== null && nowMs - this.lastDismissMs < this.cfg.dismissCooldownMs;

    switch (this.state) {
      case "CLEAR": {
        if (!inDismissCooldown && smoothedScore !== null && smoothedScore >= suspicious) {
          if (this.suspiciousEnterMs === null) {
            this.suspiciousEnterMs = nowMs;
          } else if (nowMs - this.suspiciousEnterMs >= this.cfg.suspiciousDwellMs) {
            this.state = "SUSPICIOUS";
            this.suspiciousEnterMs = nowMs;
            if (smoothedScore >= challenge) {
              this.challengeEnterMs = nowMs;
            }
          }
        } else {
          this.suspiciousEnterMs = null;
        }
        break;
      }

      case "SUSPICIOUS": {
        if (smoothedScore === null || smoothedScore < exitClear) {
          this.state = "CLEAR";
          this.suspiciousEnterMs = null;
          this.challengeEnterMs = null;
        } else {
          if (smoothedScore >= challenge) {
            if (this.challengeEnterMs === null) {
              this.challengeEnterMs = nowMs;
            } else if (nowMs - this.challengeEnterMs >= this.cfg.challengeDwellMs) {
              this.enterChallenge(nowMs, smoothedScore >= alert);
            }
          } else {
            this.challengeEnterMs = null;
          }

          if (this.state === "SUSPICIOUS" && this.suspiciousEnterMs !== null) {
            if (nowMs - this.suspiciousEnterMs >= 8000) {
              this.enterChallenge(nowMs, smoothedScore >= alert);
            }
          }
        }
        break;
      }

      case "CHALLENGE": {
        // Track alert dwell
        if (smoothedScore !== null && smoothedScore >= alert) {
          if (this.alertScoreEnterMs === null) {
            this.alertScoreEnterMs = nowMs;
          } else if (nowMs - this.alertScoreEnterMs >= this.cfg.alertDwellMs) {
            this.state = "ALERT";
            reasons.push("Sustained critical fake score during challenge");
            break;
          }
        } else {
          this.alertScoreEnterMs = null;
        }

        // Verifier response
        if (challengeStatus) {
          if (challengeStatus.artifactScore >= this.cfg.artifactAlertThreshold) {
            this.state = "ALERT";
            reasons.push(`Visual breakdown detected during challenge (${challengeStatus.artifactScore.toFixed(2)})`);
            break;
          }
          if (challengeStatus.state === "failed") {
            this.state = "ALERT";
            reasons.push("Caller failed interactive challenge");
            break;
          }
          if (challengeStatus.state === "passed") {
            if (smoothedScore !== null && smoothedScore >= suspicious) {
              this.state = "SUSPICIOUS";
              this.suspiciousEnterMs = nowMs;
            } else {
              this.state = "CLEAR";
              this.suspiciousEnterMs = null;
            }
            this.currentChallenge = undefined;
            this.challengeDeadlineMs = undefined;
            reasons.push("Challenge passed");
            break;
          }
        }

        // Timeout
        if (this.challengeDeadlineMs !== null && nowMs >= (this.challengeDeadlineMs ?? 0)) {
          if (smoothedScore !== null && smoothedScore >= suspicious) {
            this.state = "ALERT";
            reasons.push("Challenge timed out with elevated suspicion");
          } else {
            this.state = "CLEAR";
            this.currentChallenge = undefined;
            this.challengeDeadlineMs = undefined;
          }
        }
        break;
      }

      case "ALERT": {
        if (smoothedScore !== null && smoothedScore < exitClear) {
          if (this.alertLowScoreEnterMs === null) {
            this.alertLowScoreEnterMs = nowMs;
          } else if (nowMs - this.alertLowScoreEnterMs >= 30000) {
            this.state = "CLEAR";
            this.alertLowScoreEnterMs = null;
          }
        } else {
          this.alertLowScoreEnterMs = null;
        }
        break;
      }
    }

    return {
      tsMs: nowMs,
      state: this.state,
      fusedScore: smoothedScore,
      reasons: [...reasons],
      challenge: this.state === "CHALLENGE" ? this.currentChallenge : undefined,
      challengeDeadlineMs: this.state === "CHALLENGE" ? this.challengeDeadlineMs : undefined,
    };
  }

  private enterChallenge(nowMs: Ms, isAlertScore: boolean) {
    this.state = "CHALLENGE";
    this.currentChallenge = this.pickNextChallenge();
    this.challengeDeadlineMs = nowMs + this.cfg.challengeTimeoutMs;
    this.alertScoreEnterMs = isAlertScore ? nowMs : null;
  }
}
