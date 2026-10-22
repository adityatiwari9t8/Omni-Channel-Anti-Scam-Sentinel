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
  return {
    audio: settings.useMock.audio ? mockAudioDetector() : createAudioDetector(),
    vision: settings.useMock.vision ? mockVisionDetector() : createVisionDetector(),
    sync: settings.useMock.sync ? mockSyncDetector() : createSyncDetector(),
    challenge: settings.useMock.challenge ? mockChallengeVerifier() : createChallengeVerifier(),
  };
}
