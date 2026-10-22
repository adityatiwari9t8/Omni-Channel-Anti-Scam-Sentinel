class Chunker extends AudioWorkletProcessor {
  private buf = new Float32Array(1600);
  private n = 0;

  process(inputs: Float32Array[][]): boolean {
    const chs = inputs[0];
    if (!chs || !chs.length) return true;

    for (let i = 0; i < chs[0].length; i++) {
      let s = 0;
      for (let c = 0; c < chs.length; c++) {
        s += chs[c][i];
      }
      this.buf[this.n++] = s / chs.length;

      if (this.n === this.buf.length) {
        this.port.postMessage(this.buf.slice(0));
        this.n = 0;
      }
    }
    return true;
  }
}

registerProcessor("chunker", Chunker);
