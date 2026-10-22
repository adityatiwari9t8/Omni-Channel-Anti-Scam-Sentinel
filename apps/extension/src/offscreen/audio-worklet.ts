class Chunker extends AudioWorkletProcessor {
  private buf = new Float32Array(1600);
  private n = 0;
  private phase = 0;
  private sum = 0;
  private count = 0;

  process(inputs: Float32Array[][]): boolean {
    const chs = inputs[0];
    if (!chs || !chs.length) return true;

    const inputRate = sampleRate;
    const outputPerInput = 16000 / inputRate;
    for (let i = 0; i < chs[0].length; i++) {
      let s = 0;
      for (let c = 0; c < chs.length; c++) {
        s += Number.isFinite(chs[c][i]) ? chs[c][i] : 0;
      }
      // Average the input samples in each output interval. This is identity at
      // 16 kHz and performs a lightweight anti-aliasing downsample at 44.1/48 kHz.
      this.sum += s / chs.length;
      this.count++;
      this.phase += outputPerInput;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.buf[this.n++] = this.sum / this.count;
        this.sum = 0;
        this.count = 0;
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf.slice(0));
          this.n = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("chunker", Chunker);
