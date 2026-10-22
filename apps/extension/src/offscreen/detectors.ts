import { createAudioDetector } from "@sentinel/audio-detector";
import { createVisionDetector } from "@sentinel/vision-detector";
import { createSyncDetector } from "@sentinel/sync-detector";
import { createChallengeVerifier } from "@sentinel/challenge-verifier";
import {
  mockAudioDetector,
  mockChallengeVerifier,
  mockSyncDetector,
  mockVisionDetector,
} from "@sentinel/mocks";
import type {
  AudioDetector,
  ChallengeVerifier,
  Settings,
  SyncDetector,
  VisionDetector,
} from "@sentinel/contracts";

export interface DetectorSet {
  audio: AudioDetector;
  vision: VisionDetector;
  sync: SyncDetector;
  challenge: ChallengeVerifier;
}

export function buildDetectors(settings: Settings): DetectorSet {
  const useMock = (module: keyof Settings["useMock"]) => __SENTINEL_DEV__ && settings.useMock[module];
  return {
    audio: useMock("audio") ? mockAudioDetector() : createAudioDetector(),
    vision: useMock("vision") ? mockVisionDetector() : createVisionDetector(),
    sync: useMock("sync") ? mockSyncDetector() : createSyncDetector(),
    challenge: useMock("challenge") ? mockChallengeVerifier() : createChallengeVerifier(),
  };
}
