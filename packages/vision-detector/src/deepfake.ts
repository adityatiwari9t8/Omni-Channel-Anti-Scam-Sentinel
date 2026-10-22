import * as ort from "onnxruntime-web/webgpu";
import type { InitOptions, Score01 } from "@sentinel/contracts";
import type { Box } from "./geometry";

const MODEL_PATH = "models/vision/community-forensics-vit.onnx";
const INPUT_SIZE = 384;
const RESIZE_SIZE = 440;
const MEAN = [0.4815, 0.4578, 0.4082];
const STD = [0.2686, 0.2613, 0.2758];
const INPUT_SHAPE = [1, 3, INPUT_SIZE, INPUT_SIZE] as const;

export const FRAME_CLASSIFIER_PREPROCESSING = {
  modelPath: MODEL_PATH,
  inputSize: INPUT_SIZE,
  resizeSize: RESIZE_SIZE,
  inputShape: INPUT_SHAPE,
  colorOrder: "RGB",
  tensorLayout: "NCHW",
  mean: MEAN,
  std: STD,
} as const;

export interface FrameClassifier {
  scoreFace(frame: ImageBitmap, box: Box): Promise<Score01>;
  dispose(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface FaceCropRect { x: number; y: number; side: number; }

export function computeFaceCropRect(frameWidth: number, frameHeight: number, box: Box): FaceCropRect {
  const width = Math.max(1, box.x1 - box.x0);
  const height = Math.max(1, box.y1 - box.y0);
  const side = Math.max(1, Math.min(Math.max(width, height) * 1.3, frameWidth, frameHeight));
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  return {
    x: Math.round(clamp(cx - side / 2, 0, frameWidth - side)),
    y: Math.round(clamp(cy - side / 2, 0, frameHeight - side)),
    side,
  };
}

export function normalizeRgbaToChw(pixels: ArrayLike<number>): Float32Array {
  if (pixels.length % 4 !== 0) throw new Error("RGBA pixel data length must be divisible by four");
  const plane = pixels.length / 4;
  const chw = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    chw[i] = (pixels[i * 4] / 255 - MEAN[0]) / STD[0];
    chw[plane + i] = (pixels[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
    chw[plane * 2 + i] = (pixels[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }
  return chw;
}

export function fakeScoreFromLogit(rawLogit: number): number {
  if (!Number.isFinite(rawLogit)) throw new Error("Frame classifier returned a non-finite score");
  return Math.max(0, Math.min(1, 1 / (1 + Math.exp(-rawLogit))));
}

async function faceTensor(frame: ImageBitmap, box: Box): Promise<ort.Tensor> {
  const cropRect = computeFaceCropRect(frame.width, frame.height, box);
  const crop = await createImageBitmap(frame, cropRect.x, cropRect.y, Math.max(1, Math.floor(cropRect.side)), Math.max(1, Math.floor(cropRect.side)));
  try {
    const resized = new OffscreenCanvas(RESIZE_SIZE, RESIZE_SIZE);
    const resizedContext = resized.getContext("2d", { willReadFrequently: true });
    if (!resizedContext) throw new Error("Could not create image preprocessing context");
    resizedContext.drawImage(crop, 0, 0, RESIZE_SIZE, RESIZE_SIZE);
    // The model card specifies 440-pixel resize followed by a 384-pixel center crop.
    const center = (RESIZE_SIZE - INPUT_SIZE) / 2;
    const pixels = resizedContext.getImageData(center, center, INPUT_SIZE, INPUT_SIZE).data;
    const chw = normalizeRgbaToChw(pixels);
    return new ort.Tensor("float32", chw, [...INPUT_SHAPE]);
  } finally {
    crop.close();
  }
}

export async function createFrameClassifier(opts: InitOptions): Promise<FrameClassifier> {
  ort.env.wasm.wasmPaths = `${opts.assetBase}ort/`;
  ort.env.wasm.numThreads = 1;
  const modelUrl = `${opts.assetBase}${MODEL_PATH}`;
  let session: ort.InferenceSession;
  if (opts.preferWebGPU) {
    try {
      session = await ort.InferenceSession.create(modelUrl, { executionProviders: ["webgpu", "wasm"] });
    } catch {
      session = await ort.InferenceSession.create(modelUrl, { executionProviders: ["wasm"] });
    }
  } else {
    session = await ort.InferenceSession.create(modelUrl, { executionProviders: ["wasm"] });
  }
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  return {
    async scoreFace(frame, box) {
      const input = await faceTensor(frame, box);
      const outputs = await session.run({ [inputName]: input });
      const rawLogit = Number(outputs[outputName].data[0]);
      return fakeScoreFromLogit(rawLogit);
    },
    dispose() { void session.release(); },
  };
}
