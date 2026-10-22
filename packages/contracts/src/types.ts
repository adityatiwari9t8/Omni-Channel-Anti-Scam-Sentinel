/** All timestamps: milliseconds on one shared clock = performance.timeOrigin + performance.now(). */
export type Ms = number;
/** 0 = looks real, 1 = looks fake. */
export type Score01 = number;

export const SAMPLE_RATE = 16000;          // analysis audio, mono
export const AUDIO_CHUNK_MS = 100;         // pipeline pushes 100 ms chunks (1600 samples)
export const FRAME_FPS = 10;               // video frames per second sent to the pipeline (the pipeline drops frames when busy)
export const FRAME_MAX_WIDTH = 480;        // px, aspect ratio kept

/** URL prefix that ends with "/", e.g. chrome.runtime.getURL("") in the extension, "/" in the harness. */
export interface InitOptions {
  assetBase: string;
  preferWebGPU?: boolean;   // detectors fall back to WASM/CPU if unavailable
}

/** Where assets are placed in dist (see sentinel.assets.json in each package). */
export const ASSET_PATHS = {
  audioModelDir: "models/audio/",   // model.onnx + meta.json (Role 1)
  visionModelDir: "models/vision/", // face_landmarker.task (+ optional hand_landmarker.task) (Role 2)
  ortDir: "ort/",                   // onnxruntime-web .wasm/.mjs files (Role 1)
  mediapipeWasmDir: "mediapipe/wasm/", // @mediapipe/tasks-vision wasm files (Role 2)
} as const;

// ---------- Role 1: audio ----------
export interface AudioResult {
  windowStartMs: Ms;
  windowEndMs: Ms;
  scoreFake: Score01;
  confidence: Score01;    // 0 for silent or unusable windows
  latencyMs: number;      // inference time for this window
}
export interface AudioDetector {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  init(opts: InitOptions): Promise<void>;
  /** chunk: mono Float32 PCM at 16 kHz, values in [-1, 1]. tsMs = time of the FIRST sample. Returns a result when a hop completes, else null. */
  push(chunk: Float32Array, tsMs: Ms): Promise<AudioResult | null>;
  dispose(): void;        // safe to call twice
}

// ---------- Role 1: text ----------
export interface EmailInput {
  subject: string;
  bodyText: string;
  links: { text: string; href: string }[];
  senderName: string;
  senderAddress: string;
  replyTo?: string;
}
export interface TextResult {
  risk: Score01;
  label: "safe" | "suspicious" | "phishing";
  reasons: string[];       // short plain-language strings shown in the banner
  latencyMs: number;
}
export interface TextClassifier {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  init(opts: InitOptions): Promise<void>;
  classify(e: EmailInput): Promise<TextResult>;
}

// ---------- Role 2: vision ----------
export interface FrameResult {
  tsMs: Ms;
  faceFound: boolean;
  mouthAperture: number;   // inner-lip gap / face height, about 0..0.5; 0 if no face
  headPose: { yawDeg: number; pitchDeg: number; rollDeg: number };
  faceOccluded: boolean;   // face or mouth mostly hidden
  landmarkQuality: Score01;// 1 = stable, confident landmarks
  handNearFace: boolean;   // false if hands are not tracked
  latencyMs: number;
}
export interface VisionDetector {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  init(opts: InitOptions): Promise<void>;
  processFrame(frame: ImageBitmap, tsMs: Ms): Promise<FrameResult>;
  dispose(): void;
}

export interface SyncResult {
  tsMs: Ms;
  scoreFake: Score01;
  confidence: Score01;
  correlation: number;     // best Pearson r over the lag search
  windowMs: number;
}
export interface SyncDetector {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  pushAudioEnergy(rms: number, tsMs: Ms): void;   // one call per 100 ms chunk, from the pipeline
  pushFrame(r: FrameResult): void;
  getSync(): SyncResult | null;                    // null until enough speech has been seen
  reset(): void;
}

export type ChallengeType = "turn_head_left_right" | "cover_half_face" | "raise_fingers";
export interface ChallengeStatus {
  challenge: ChallengeType;
  state: "pending" | "passed" | "failed";
  artifactScore: Score01;  // 0 = face stayed clean, 1 = obvious breakdown
  evidence: string;        // short human-readable string for the overlay
}
export interface ChallengeVerifier {
  /** true only for the scripted mocks in @sentinel/mocks */
  readonly isMock?: boolean;
  init(opts: InitOptions): Promise<void>;
  start(c: ChallengeType, tsMs: Ms): void;
  pushFrame(r: FrameResult): void;
  poll(): ChallengeStatus | null;                  // null if no challenge is active
  cancel(): void;
}

// ---------- Role 3: arbiter ----------
export type ArbiterState = "CLEAR" | "SUSPICIOUS" | "CHALLENGE" | "ALERT";
export interface ArbiterOutput {
  tsMs: Ms;
  state: ArbiterState;
  fusedScore: Score01 | null;     // null when there is not enough data
  reasons: string[];
  challenge?: ChallengeType;      // set while state is CHALLENGE
  challengeDeadlineMs?: Ms;
}

// ---------- Settings ----------
export type Sensitivity = "low" | "medium" | "high";
export interface Settings {
  sensitivity: Sensitivity;
  notifications: boolean;
  sound: boolean;
  /** true = use the mock instead of the real module, per module (for debugging and fallbacks) */
  useMock: { audio: boolean; vision: boolean; sync: boolean; challenge: boolean };
}
export const DEFAULT_SETTINGS: Settings = {
  sensitivity: "medium",
  notifications: false,
  sound: false,
  useMock: { audio: false, vision: false, sync: false, challenge: false },
};
