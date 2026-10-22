import { createPipeline, type Pipeline, type PipelineUpdate } from "@sentinel/pipeline";
import { createArbiter } from "@sentinel/arbiter";
import { createAudioDetector } from "@sentinel/audio-detector";
import { createVisionDetector } from "@sentinel/vision-detector";
import { createSyncDetector } from "@sentinel/sync-detector";
import { createChallengeVerifier } from "@sentinel/challenge-verifier";
import { AUDIO_CHUNK_MS, type ArbiterOutput, type Sensitivity } from "@sentinel/contracts";

const assetBase = new URL("./", document.baseURI).href;

const player = document.getElementById("player") as HTMLVideoElement;
const clipPicker = document.getElementById("clipPicker") as HTMLInputElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;
const exportJsonlBtn = document.getElementById("exportJsonl") as HTMLButtonElement;
const exportCsvBtn = document.getElementById("exportCsv") as HTMLButtonElement;
const statusBadge = document.getElementById("statusBadge")!;
const reasonsEl = document.getElementById("reasons")!;
const chartCanvas = document.getElementById("chart") as HTMLCanvasElement;
const chartCtx = chartCanvas.getContext("2d")!;
const logBox = document.getElementById("logBox")!;

const sensitivitySel = document.getElementById("sensitivity") as HTMLSelectElement;
const wAudioSlider = document.getElementById("wAudio") as HTMLInputElement;
const wSyncSlider = document.getElementById("wSync") as HTMLInputElement;
const wAudioVal = document.getElementById("wAudioVal")!;
const wSyncVal = document.getElementById("wSyncVal")!;
const wVisionSlider = document.getElementById("wVision") as HTMLInputElement;
const wVisionVal = document.getElementById("wVisionVal")!;

wAudioSlider.addEventListener("input", () => { wAudioVal.textContent = Number(wAudioSlider.value).toFixed(2); });
wSyncSlider.addEventListener("input", () => { wSyncVal.textContent = Number(wSyncSlider.value).toFixed(2); });
wVisionSlider.addEventListener("input", () => { wVisionVal.textContent = Number(wVisionSlider.value).toFixed(2); });

let pipeline: Pipeline | null = null;
let audioCtx: AudioContext | null = null;
let mediaSource: MediaElementAudioSourceNode | null = null;
let chunkerNode: AudioWorkletNode | null = null;
let isRunning = false;
let frameLoopId: number | null = null;
let heartbeatHandle: number | null = null;
let selectedObjectUrl: string | null = null;

const history: { t: number; score: number | null; state: string }[] = [];
const loggedLines: any[] = [];

clipPicker.addEventListener("change", () => {
  const file = clipPicker.files?.[0];
  if (file) {
    if (selectedObjectUrl) URL.revokeObjectURL(selectedObjectUrl);
    selectedObjectUrl = URL.createObjectURL(file);
    player.src = selectedObjectUrl;
  }
});

function drawChart() {
  const w = chartCanvas.width;
  const h = chartCanvas.height;
  chartCtx.clearRect(0, 0, w, h);

  // Grid
  chartCtx.strokeStyle = "#1e293b";
  chartCtx.lineWidth = 1;
  for (let y = 0; y <= 1; y += 0.25) {
    const py = h - y * h;
    chartCtx.beginPath();
    chartCtx.moveTo(0, py);
    chartCtx.lineTo(w, py);
    chartCtx.stroke();
  }

  if (history.length < 2) return;

  const maxPoints = 80;
  const points = history.slice(-maxPoints);

  chartCtx.beginPath();
  chartCtx.strokeStyle = "#38bdf8";
  chartCtx.lineWidth = 2;

  let drawing = false;
  points.forEach((pt, i) => {
    const px = (i / (maxPoints - 1)) * w;
    if (pt.score === null) { drawing = false; return; }
    const scoreVal = pt.score;
    const py = h - scoreVal * (h - 20) - 10;
    if (!drawing) { chartCtx.moveTo(px, py); drawing = true; }
    else chartCtx.lineTo(px, py);
  });
  chartCtx.stroke();
}

async function startReplay() {
  stopReplay();
  isRunning = true;
  heartbeatHandle = window.setInterval(() => {
    if (isRunning && pipeline === activePipeline) activePipeline.heartbeat(performance.timeOrigin + performance.now());
  }, 500);
  history.length = 0;
  loggedLines.length = 0;
  logBox.textContent = "";

  const arbiter = createArbiter({
    wAudio: Number(wAudioSlider.value),
    wSync: Number(wSyncSlider.value),
    wVision: Number(wVisionSlider.value),
  });
  arbiter.setSensitivity(sensitivitySel.value as Sensitivity);

  pipeline = createPipeline(
    {
      audio: createAudioDetector(),
      vision: createVisionDetector(),
      sync: createSyncDetector(),
      challenge: createChallengeVerifier(),
      arbiter,
    },
    {
      logger: (line) => {
        loggedLines.push(line);
        const row = document.createElement("div");
        row.textContent = `[${new Date().toISOString().slice(11, 19)}] ${JSON.stringify(line)}`;
        logBox.appendChild(row);
        logBox.scrollTop = logBox.scrollHeight;
      },
    },
  );

  const activePipeline = pipeline;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
      await audioCtx.audioWorklet.addModule(new URL("./audio-worklet.js", document.baseURI));
      mediaSource = audioCtx.createMediaElementSource(player);
      mediaSource.connect(audioCtx.destination);
    }
    if (chunkerNode) {
      mediaSource?.disconnect(chunkerNode);
      chunkerNode.disconnect();
    }
    chunkerNode = new AudioWorkletNode(audioCtx, "chunker", { numberOfInputs: 1, numberOfOutputs: 0 });
    chunkerNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (isRunning && pipeline === activePipeline) activePipeline?.pushAudio(e.data, performance.timeOrigin + performance.now() - AUDIO_CHUNK_MS);
    };
    mediaSource!.connect(chunkerNode);
    await audioCtx.resume();
    if (!isRunning || pipeline !== activePipeline) {
      mediaSource?.disconnect(chunkerNode);
      chunkerNode.disconnect();
      chunkerNode = null;
      return;
    }
    await activePipeline.start({ assetBase });
    if (pipeline !== activePipeline) {
      activePipeline.stop();
      return;
    }
  } catch (error) {
    isRunning = false;
    if (chunkerNode) {
      chunkerNode.port.onmessage = null;
      mediaSource?.disconnect(chunkerNode);
      chunkerNode.disconnect();
      chunkerNode = null;
    }
    if (pipeline === activePipeline) {
      activePipeline.stop();
      pipeline = null;
    }
    statusBadge.textContent = "START FAILED";
    statusBadge.className = "status-badge badge-alert";
    reasonsEl.textContent = error instanceof Error ? error.message : String(error);
    return;
  }
  isRunning = true;

  pipeline.onUpdate((u: PipelineUpdate) => {
    const out: ArbiterOutput = u.out;
    const noEvidence = out.state === "CLEAR" && out.fusedScore === null;
    statusBadge.textContent = noEvidence ? "NO DATA" : out.state;
    statusBadge.className = `status-badge badge-${noEvidence ? "no-data" : out.state.toLowerCase()}`;
    reasonsEl.textContent = out.reasons.join(" • ") || "Normal signal metrics";

    history.push({
      t: performance.now(),
      score: out.fusedScore,
      state: out.state,
    });
    drawChart();
  });

  // Setup frame sampling
  const sampleFrame = async () => {
    if (!isRunning || !pipeline || player.paused || player.ended) {
      if (isRunning) frameLoopId = requestAnimationFrame(sampleFrame);
      return;
    }

    try {
      if (player.videoWidth > 0) {
        const bmp = await createImageBitmap(player);
        await pipeline.pushFrame(bmp, performance.timeOrigin + performance.now());
        bmp.close();
      }
    } catch (err) {
      console.warn("Frame capture error:", err);
    }
    frameLoopId = requestAnimationFrame(sampleFrame);
  };

  void player.play();
  frameLoopId = requestAnimationFrame(sampleFrame);
}

function stopReplay() {
  isRunning = false;
  if (heartbeatHandle !== null) {
    clearInterval(heartbeatHandle);
    heartbeatHandle = null;
  }
  if (frameLoopId !== null) {
    cancelAnimationFrame(frameLoopId);
    frameLoopId = null;
  }
  if (pipeline) {
    pipeline.stop();
    pipeline = null;
  }
  if (audioCtx) {
    if (chunkerNode) {
      chunkerNode.port.onmessage = null;
      mediaSource?.disconnect(chunkerNode);
      chunkerNode.disconnect();
      chunkerNode = null;
    }
  }
}

startBtn.addEventListener("click", () => void startReplay());
stopBtn.addEventListener("click", stopReplay);

exportJsonlBtn.addEventListener("click", () => {
  const content = loggedLines.map((l) => JSON.stringify(l)).join("\n");
  const blob = new Blob([content], { type: "application/jsonlines" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sentinel-decision-log-${Date.now()}.jsonl`;
  a.click();
});

exportCsvBtn.addEventListener("click", () => {
  const rows = ["timestamp,fusedScore,state"];
  for (const h of history) {
    rows.push(`${h.t},${h.score ?? ""},${h.state}`);
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sentinel-scores-${Date.now()}.csv`;
  a.click();
});
