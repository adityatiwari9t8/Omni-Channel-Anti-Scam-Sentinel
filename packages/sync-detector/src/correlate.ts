export function pearson(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const am = a.reduce((s, x) => s + x, 0) / a.length, bm = b.reduce((s, x) => s + x, 0) / b.length;
  let cov = 0, av = 0, bv = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - am, y = b[i] - bm; cov += x * y; av += x * x; bv += y * y; }
  return av < 1e-10 || bv < 1e-10 ? null : cov / Math.sqrt(av * bv);
}

export function bestLagCorrelation(a: Array<number | null>, b: Array<number | null>, maxLag = 4): number | null {
  let best = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const x: number[] = [], y: number[] = [];
    for (let i = 0; i < a.length; i++) {
      const j = i + lag;
      if (j < 0 || j >= b.length || a[i] === null || b[j] === null) continue;
      x.push(a[i] as number); y.push(b[j] as number);
    }
    const r = pearson(x, y);
    if (r !== null && r > best) best = r;
  }
  return Number.isFinite(best) ? best : null;
}
