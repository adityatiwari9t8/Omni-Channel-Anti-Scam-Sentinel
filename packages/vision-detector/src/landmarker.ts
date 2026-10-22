import { FaceLandmarker, FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { Point3 } from "./geometry";

export interface LandmarkerFaceResult {
  faceLandmarks: Point3[][];
  facialTransformationMatrixes?: Array<{ data?: ArrayLike<number> }>;
}
export interface LandmarkerHandResult { landmarks: Point3[][] }
export interface Landmarkers {
  face: { detectForVideo(frame: ImageBitmap, timestampMs: number): LandmarkerFaceResult; close(): void };
  hands: { detectForVideo(frame: ImageBitmap, timestampMs: number): LandmarkerHandResult; close(): void } | null;
  backend: "GPU" | "CPU";
}

export async function createLandmarkers(assetBase: string, preferGPU: boolean, useHands = true): Promise<Landmarkers> {
  const files = await FilesetResolver.forVisionTasks(`${assetBase}mediapipe/wasm/`);
  const create = async (delegate: "GPU" | "CPU") => {
    const face = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: `${assetBase}models/vision/face_landmarker.task`, delegate },
      runningMode: "VIDEO", numFaces: 2, outputFacialTransformationMatrixes: true,
    });
    let hands: HandLandmarker | null = null;
    try {
      if (useHands) hands = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${assetBase}models/vision/hand_landmarker.task`, delegate },
        runningMode: "VIDEO", numHands: 2,
      });
    } catch (e) { face.close(); throw e; }
    return { face, hands };
  };
  let created: Awaited<ReturnType<typeof create>>;
  let backend: "GPU" | "CPU" = "CPU";
  if (preferGPU) {
    try { created = await create("GPU"); backend = "GPU"; }
    catch { created = await create("CPU"); }
  } else created = await create("CPU");
  return {
    face: created.face as unknown as Landmarkers["face"],
    hands: created.hands as unknown as Landmarkers["hands"], backend,
  };
}
