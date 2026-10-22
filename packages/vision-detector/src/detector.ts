import type { FrameResult, InitOptions, VisionDetector } from "@sentinel/contracts";
import { faceBox, handGeometry, largestFaceIndex, mouthAperture, poseFromLandmarks, poseFromMatrix, type Point3 } from "./geometry";
import { LandmarkQuality } from "./quality";
import { createLandmarkers, type LandmarkerFaceResult, type LandmarkerHandResult, type Landmarkers } from "./landmarker";
import { createFrameClassifier, type FrameClassifier } from "./deepfake";

export type LandmarkerFactory = (opts: InitOptions, useHands: boolean) => Promise<Landmarkers>;
export type FrameClassifierFactory = (opts: InitOptions) => Promise<FrameClassifier>;
const noFace = (tsMs: number, latencyMs: number, deepfakeAvailable = false): FrameResult => ({ tsMs, faceFound: false, mouthAperture: 0,
  headPose: { yawDeg: 0, pitchDeg: 0, rollDeg: 0 }, faceOccluded: true, landmarkQuality: 0, handNearFace: false, raisedFingers: 0, deepfakeAvailable, latencyMs });

export function makeVisionDetector(factory: LandmarkerFactory = (o, hands) => createLandmarkers(o.assetBase, Boolean(o.preferWebGPU), hands), useHands = true, classifierFactory?: FrameClassifierFactory): VisionDetector & { backend: "GPU" | "CPU" | null; errors: number; classifierErrors: number } {
  let models: Landmarkers | null = null, lastMpTs = -1, disposed = false, errors = 0;
  let classifier: FrameClassifier | null = null;
  let classifierErrors = 0;
  let classifierBusy = false;
  let lastClassifierStartedAt = -Infinity;
  let lastClassifierCompletedAt = -Infinity;
  let latestDeepfakeScore: number | undefined;
  const quality = new LandmarkQuality();
  let previousFaceCenter: { x: number; y: number } | undefined;
  let apertureHistory: number[] = [];
  return {
    backend: null, errors: 0, classifierErrors: 0,
    async init(opts) {
      if (models) return;
      disposed = false;
      models = await factory(opts, useHands);
      this.backend = models.backend;
      if (classifierFactory) {
        try { classifier = await classifierFactory(opts); }
        catch (error) {
          classifierErrors++; this.classifierErrors = classifierErrors;
          console.warn("[sentinel] Frame classifier unavailable; continuing with landmark signals only.", error);
        }
      }
      const c = typeof document !== "undefined" ? document.createElement("canvas") : null;
      if (c) {
        c.width = 32; c.height = 32;
        const blank = await createImageBitmap(c);
        try { models.face.detectForVideo(blank, 0); models.hands?.detectForVideo(blank, 0); } finally { blank.close(); }
      }
    },
    async processFrame(frame, tsMs) {
      const t0 = performance.now();
      try {
        if (!models || disposed) return noFace(tsMs, performance.now() - t0, classifier !== null);
        const mpTs = Math.max(lastMpTs + 1, Math.round(tsMs)); lastMpTs = mpTs;
        const faces: LandmarkerFaceResult = models.face.detectForVideo(frame, mpTs);
        const handResults: LandmarkerHandResult | null = models.hands?.detectForVideo(frame, mpTs) ?? null;
        const facesLm = faces.faceLandmarks ?? [];
        const selected = largestFaceIndex(facesLm, frame.width, frame.height, previousFaceCenter);
        if (selected < 0) { quality.reset(); previousFaceCenter = undefined; apertureHistory = []; return noFace(tsMs, performance.now() - t0, classifier !== null); }
        const points = facesLm[selected];
        const box = faceBox(points, frame.width, frame.height);
        if (!box) { quality.reset(); previousFaceCenter = undefined; apertureHistory = []; return noFace(tsMs, performance.now() - t0, classifier !== null); }
        const perfNow = performance.now();
        if (classifier && !classifierBusy && perfNow - lastClassifierStartedAt >= 2000) {
          const activeClassifier = classifier;
          classifierBusy = true;
          lastClassifierStartedAt = perfNow;
          // Keep an independent frame while inference runs so the pipeline can release its bitmap.
          void (async () => {
            let snapshot: ImageBitmap | undefined;
            try {
              snapshot = await createImageBitmap(frame);
              const score = await activeClassifier.scoreFace(snapshot, box);
              if (!disposed) {
                latestDeepfakeScore = score;
                lastClassifierCompletedAt = performance.now();
              }
            } catch (error) {
              if (!disposed) {
                classifierErrors++; this.classifierErrors = classifierErrors;
                console.warn("[sentinel] Frame classifier inference failed.", error);
              }
            } finally {
              snapshot?.close();
              classifierBusy = false;
            }
          })();
        }
        previousFaceCenter = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
        const faceH = Math.max(0, box.y1 - box.y0);
        const matrix = faces.facialTransformationMatrixes?.[selected];
        const pose = poseFromMatrix(matrix) ?? poseFromLandmarks(points, frame.width, frame.height);
        const hand = handGeometry(handResults?.landmarks ?? [], frame.width, frame.height, box);
        apertureHistory.push(mouthAperture(points, frame.width, frame.height));
        apertureHistory = apertureHistory.slice(-3);
        const sortedApertures = [...apertureHistory].sort((a, b) => a - b);
        const result: FrameResult = {
          tsMs, faceFound: true,
          mouthAperture: sortedApertures[Math.floor(sortedApertures.length / 2)], headPose: pose,
          faceOccluded: hand.coverage > 0.35, landmarkQuality: quality.measure(points, faceH, frame.width, frame.height),
          handNearFace: hand.near, raisedFingers: hand.raisedFingers, latencyMs: performance.now() - t0,
          deepfakeAvailable: classifier !== null,
          ...(latestDeepfakeScore !== undefined && performance.now() - lastClassifierCompletedAt <= 4000
            ? { deepfakeScore: latestDeepfakeScore, deepfakeConfidence: 0.4 }
            : {}),
        };
        return result;
      } catch {
        errors++; this.errors = errors; quality.reset(); previousFaceCenter = undefined; apertureHistory = [];
        return noFace(tsMs, performance.now() - t0, classifier !== null);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; models?.face.close(); models?.hands?.close(); models = null; classifier?.dispose(); classifier = null; quality.reset(); lastMpTs = -1;
      previousFaceCenter = undefined; apertureHistory = [];
      latestDeepfakeScore = undefined; lastClassifierCompletedAt = -Infinity; lastClassifierStartedAt = -Infinity;
    },
  };
}

export function createVisionDetector(): VisionDetector { return makeVisionDetector(undefined, true, createFrameClassifier); }
