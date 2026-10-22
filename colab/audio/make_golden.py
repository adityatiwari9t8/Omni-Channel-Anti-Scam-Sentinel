"""Write an input fixture for the raw-waveform AASIST model from a 16 kHz WAV."""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

if len(sys.argv) != 2:
    raise SystemExit("usage: python colab/audio/make_golden.py eval/clips/wav/clip.wav")
source = Path(sys.argv[1])
audio, sample_rate = sf.read(source, dtype="float32", always_2d=False)
if audio.ndim == 2:
    audio = audio.mean(axis=1)
if sample_rate != 16000:
    raise SystemExit(f"expected 16 kHz mono audio; got {sample_rate} Hz")
if len(audio) < 64600:
    raise SystemExit("input must contain at least 64,600 samples (about 4.04 seconds)")
audio = np.asarray(audio[:64600], dtype=np.float32)
out = Path("packages/audio-detector/tests/golden")
out.mkdir(parents=True, exist_ok=True)
audio.tofile(out / "input.f32")
audio.tofile(out / "features.f32")
(out / "meta.json").write_text(json.dumps({"shape": [1, 64600], "features": "raw mono PCM; no external feature transform", "sampleRate": 16000, "model": "AASIST"}, indent=2) + "\n", encoding="utf-8")
print(f"Wrote the 64,600-sample raw-waveform model input fixture to {out}.")
