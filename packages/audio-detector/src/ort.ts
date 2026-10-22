import * as ort from "onnxruntime-web/webgpu";
import type { AudioModelMeta } from "./meta";
export interface InferenceSessionLike { run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<unknown> }>>; release?(): void; }
export interface SessionResult { session: InferenceSessionLike; backend: "webgpu" | "wasm"; }

async function warm(session: InferenceSessionLike, meta: AudioModelMeta): Promise<void> {
  await session.run({ [meta.inputName]: new ort.Tensor("float32", new Float32Array(meta.windowSamples), [1, meta.windowSamples]) });
}
export async function createOrtSession(assetBase: string, meta: AudioModelMeta, preferWebGPU = false): Promise<SessionResult> {
  ort.env.wasm.wasmPaths = `${assetBase}ort/`; ort.env.wasm.numThreads = 1;
  const model = `${assetBase}models/audio/model.onnx`;
  if (preferWebGPU) {
    try { const session = await ort.InferenceSession.create(model, { executionProviders: ["webgpu", "wasm"] }); await warm(session, meta); return { session, backend: "webgpu" }; }
    catch (gpuError) {
      try { const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] }); await warm(session, meta); return { session, backend: "wasm" }; }
      catch (wasmError) { throw new Error(`ONNX initialization failed (WebGPU: ${String(gpuError)}; WASM: ${String(wasmError)})`); }
    }
  }
  const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
  await warm(session, meta); return { session, backend: "wasm" };
}
