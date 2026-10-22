import type {
  ArbiterOutput,
  AudioDetector,
  AudioResult,
  ChallengeVerifier,
  FrameResult,
  InitOptions,
  Ms,
  Settings,
  SyncDetector,
  SyncResult,
  VisionDetector,
} from "@sentinel/contracts";
import type { Arbiter } from "@sentinel/arbiter";
import { rms } from "./rms";

export * from "./rms";

export interface PipelineDeps {
  audio: AudioDetector;
  vision: VisionDetector;
  sync: SyncDetector;
  challenge: ChallengeVerifier;
  arbiter: Arbiter;
}

export interface PipelineUpdate {
  out: ArbiterOutput;
  audio: AudioResult | null;
  sync: SyncResult | null;
  frame: FrameResult | null;
}

export interface Pipeline {
  start(init: InitOptions): Promise<void>;
  pushAudio(chunk: Float32Array, tsMs: Ms): void;
  pushFrame(frame: ImageBitmap, tsMs: Ms): Promise<void>;
  /** Re-evaluate signal freshness when a capture stream stops producing samples. */
  heartbeat(tsMs: Ms): void;
  setSettings(s: Settings): void;
  onUpdate(cb: (u: PipelineUpdate) => void): void;
  stop(): void;
  getDroppedAudioCount(): number;
}

export function createPipeline(
  deps: PipelineDeps,
  opts?: { logger?: (line: object) => void },
): Pipeline {
  let isRunning = false;
  let runGeneration = 0;
  let inChallenge = false;
  let activeChallengeType: string | undefined = undefined;

  let latestAudioResult: AudioResult | null = null;
  let latestSyncResult: SyncResult | null = null;
  let latestFrameResult: FrameResult | null = null;

  let isAudioProcessing = false;
  let pendingAudioChunk: { chunk: Float32Array; tsMs: Ms } | null = null;
  let droppedAudioCount = 0;

  const updateListeners = new Set<(u: PipelineUpdate) => void>();

  async function processAudioQueue(generation: number) {
    if (generation !== runGeneration || !isRunning || isAudioProcessing || !pendingAudioChunk) return;
    isAudioProcessing = true;
    const { chunk, tsMs } = pendingAudioChunk;
    pendingAudioChunk = null;

    try {
      const res = await deps.audio.push(chunk, tsMs);
      if (res && generation === runGeneration && isRunning) {
        latestAudioResult = res;
        deps.arbiter.onAudio(res);
        emitUpdate(tsMs);
      }
    } catch (err) {
      console.error("[pipeline] Audio push failed:", err);
    } finally {
      if (generation !== runGeneration) return;
      isAudioProcessing = false;
      if (pendingAudioChunk) {
        void processAudioQueue(generation);
      }
    }
  }

  function emitUpdate(tsMs: Ms) {
    const out = deps.arbiter.tick(tsMs);

    // Challenge flow control
    if (out.state === "CHALLENGE" && out.challenge) {
      if (!inChallenge || activeChallengeType !== out.challenge) {
        inChallenge = true;
        activeChallengeType = out.challenge;
        deps.arbiter.onChallenge(null);
        deps.challenge.start(out.challenge, tsMs);
      }
    } else if (inChallenge) {
      inChallenge = false;
      activeChallengeType = undefined;
      deps.challenge.cancel();
      deps.arbiter.onChallenge(null);
    }

    const update: PipelineUpdate = {
      out,
      audio: latestAudioResult,
      sync: latestSyncResult,
      frame: latestFrameResult,
    };

    for (const cb of updateListeners) {
      try {
        cb(update);
      } catch (err) {
        console.error("[pipeline] Listener error:", err);
      }
    }

    if (opts?.logger) {
      try {
        opts.logger({
          ts: tsMs,
          out,
          audio: latestAudioResult,
          sync: latestSyncResult,
          frame: latestFrameResult,
          droppedAudioCount,
        });
      } catch (err) {
        console.error("[pipeline] Logger error:", err);
      }
    }
  }

  return {
    async start(init: InitOptions): Promise<void> {
      const generation = ++runGeneration;
      isRunning = true;
      inChallenge = false;
      activeChallengeType = undefined;
      droppedAudioCount = 0;
      latestAudioResult = null;
      latestSyncResult = null;
      latestFrameResult = null;
      isAudioProcessing = false;
      pendingAudioChunk = null;

      try {
        await Promise.all([
          deps.audio.init(init),
          deps.vision.init(init),
          deps.challenge.init(init),
        ]);
      } catch (error) {
        if (generation === runGeneration) {
          isRunning = false;
          deps.audio.dispose();
          deps.vision.dispose();
          deps.challenge.cancel();
        }
        throw error;
      }
      if (generation !== runGeneration || !isRunning) {
        deps.audio.dispose();
        deps.vision.dispose();
        deps.challenge.cancel();
      }
    },

    pushAudio(chunk: Float32Array, tsMs: Ms): void {
      if (!isRunning) return;
      const energy = rms(chunk);
      deps.sync.pushAudioEnergy(energy, tsMs);

      if (isAudioProcessing) {
        if (pendingAudioChunk) {
          droppedAudioCount++;
        }
        pendingAudioChunk = { chunk, tsMs };
      } else {
        pendingAudioChunk = { chunk, tsMs };
        void processAudioQueue(runGeneration);
      }
    },

    async pushFrame(frame: ImageBitmap, tsMs: Ms): Promise<void> {
      if (!isRunning) return;
      const generation = runGeneration;

      const frameRes = await deps.vision.processFrame(frame, tsMs);
      if (generation !== runGeneration || !isRunning) return;
      latestFrameResult = frameRes;

      deps.sync.pushFrame(frameRes);
      deps.challenge.pushFrame(frameRes);
      deps.arbiter.onFrame(frameRes);

      const syncRes = deps.sync.getSync();
      latestSyncResult = syncRes;
      deps.arbiter.onSync(syncRes);

      const challengeStatus = deps.challenge.poll();
      deps.arbiter.onChallenge(challengeStatus);

      emitUpdate(tsMs);
    },

    heartbeat(tsMs: Ms): void {
      if (isRunning) emitUpdate(tsMs);
    },

    setSettings(s: Settings): void {
      deps.arbiter.setSensitivity(s.sensitivity);
    },

    onUpdate(cb: (u: PipelineUpdate) => void): void {
      updateListeners.add(cb);
    },

    stop(): void {
      runGeneration++;
      isRunning = false;
      inChallenge = false;
      activeChallengeType = undefined;
      pendingAudioChunk = null;
      isAudioProcessing = false;
      updateListeners.clear();
      deps.sync.reset();
      deps.arbiter.reset();
      deps.challenge.cancel();
      deps.audio.dispose();
      deps.vision.dispose();
    },

    getDroppedAudioCount(): number {
      return droppedAudioCount;
    },
  };
}
