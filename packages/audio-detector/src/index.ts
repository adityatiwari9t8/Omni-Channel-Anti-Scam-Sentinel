import type { AudioDetector } from "@sentinel/contracts";
import { AudioDetectorImpl } from "./detector";
export { AudioDetectorImpl } from "./detector";
export { parseAudioModelMeta } from "./meta";
export function createAudioDetector(): AudioDetector { return new AudioDetectorImpl(); }
