# Model card: AASIST ASVspoof2019-LA

- **Model/version:** AASIST, official variant, ONNX export `SpeechAntiSpoofingBenchmarks/AASIST` (downloaded 2026-10-22).
- **Architecture/training source:** Audio Anti-Spoofing using Integrated Spectro-Temporal Graph Attention Networks; upstream `clovaai/aasist`, pretrained on ASVspoof 2019 Logical Access.
- **License:** MIT, carried with the model in `assets/AASIST-LICENSE.txt`; source model card is preserved in `assets/AASIST-SOURCE.md`.
- **Artifact:** `assets/model.onnx`, 1,615,195 bytes; SHA-256 `130e536266b7c537f9a13029e1612a9f392fd1cc827783683b6d1c062a3db5e1`; ONNX opset 17. Input `wav`: float32 `[1,64600]`; output `logits`: float32 `[1,2]`.
- **Input handling:** mono float32 PCM, 16 kHz; deterministic first 64,600 samples (~4.04 seconds), no resampling or normalization. Streaming window is 64,600 samples with a 32,300-sample hop. There is no output until the first full window is available. Silence is gated before inference.
- **Output conversion:** output class 1 is bona fide; class 0 is spoof. Softmax class-0 probability is emitted as `scoreFake`. Confidence combines speech activity with distance from a provisional 0.5 threshold.
- **Runtime:** ONNX Runtime Web 1.23.2, WASM by default and WebGPU attempted only when requested. Graph opset is 17. The in-app browser harness loaded the model and passed all four audio contract checks. On its 12-second synthetic signal, initialization took 3,198 ms and median inference latency was 1,533.6 ms over four windows. This exceeds the original 300 ms target; hardware and browser vary, and the synthetic signal is only a runtime fixture.
- **Published benchmark context:** upstream model card reports EER 0.83% on ASVspoof2019 LA, 12.35% on ASVspoof2021 LA, 17.04% on ASVspoof2021 DF, 43.01% on InTheWild, and 51.05% on CD-ADD. These are upstream benchmark figures, not measurements from this package or a claim about this demo's speakers.
- **Threshold/latency:** 0.5 is an uncalibrated interface default. Browser latency and quantization impact have not been measured in this workspace.
- **Limitations:** model is trained on an older logical-access attack distribution and generalizes poorly on some newer or in-the-wild sets. It is a risk signal, not proof that a speaker is synthetic. Do not use as a sole basis for identity, legal, or security decisions.
- **Model/source references:** [MIT model repository](https://huggingface.co/SpeechAntiSpoofingBenchmarks/AASIST); [AASIST paper](https://arxiv.org/abs/2110.01200).
