export interface Point3 { x: number; y: number; z?: number }
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface Pose { yawDeg: number; pitchDeg: number; rollDeg: number }

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const distance = (a: Point3, b: Point3, width: number, height: number) =>
  Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);

export function mouthAperture(points: Point3[], width: number, height: number): number {
  if (points.length <= 152 || ![10, 13, 14, 152].every((i) => Number.isFinite(points[i]?.x) && Number.isFinite(points[i]?.y))) return 0;
  const faceHeight = distance(points[10], points[152], width, height);
  if (faceHeight <= 1e-6) return 0;
  return clamp(distance(points[13], points[14], width, height) / faceHeight, 0, 1);
}

export function faceBox(points: Point3[], width: number, height: number): Box | null {
  if (!points.length) return null;
  const xs = points.map((p) => p.x * width), ys = points.map((p) => p.y * height);
  if (![...xs, ...ys].every(Number.isFinite)) return null;
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function boxArea(b: Box): number { return Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0); }

export function handGeometry(hands: Point3[][], width: number, height: number, face: Box | null): { near: boolean; coverage: number } {
  if (!face || !hands.length) return { near: false, coverage: 0 };
  const w = face.x1 - face.x0, h = face.y1 - face.y0;
  const expanded = { x0: face.x0 - w * 0.2, x1: face.x1 + w * 0.2, y0: face.y0 - h * 0.2, y1: face.y1 + h * 0.2 };
  const boxes = hands.map((points) => faceBox(points, width, height)).filter((b): b is Box => Boolean(b));
  const near = hands.some((points) => points.some((p) => {
    const x = p.x * width, y = p.y * height;
    return x >= expanded.x0 && x <= expanded.x1 && y >= expanded.y0 && y <= expanded.y1;
  }));
  // Exact union area of hand boxes clipped to face box, using x-coordinate slices.
  const clipped = boxes.map((b) => ({ x0: Math.max(face.x0, b.x0), x1: Math.min(face.x1, b.x1), y0: Math.max(face.y0, b.y0), y1: Math.min(face.y1, b.y1) }))
    .filter((b) => b.x1 > b.x0 && b.y1 > b.y0);
  const xs = [...new Set([face.x0, face.x1, ...clipped.flatMap((b) => [b.x0, b.x1])])].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1], mid = (x0 + x1) / 2;
    const ys = clipped.filter((b) => mid >= b.x0 && mid <= b.x1).map((b) => [b.y0, b.y1] as const).sort((a, b) => a[0] - b[0]);
    let start = -Infinity, end = -Infinity, covered = 0;
    for (const [a, b] of ys) {
      if (start === -Infinity) { start = a; end = b; }
      else if (a > end) { covered += Math.max(0, end - start); start = a; end = b; }
      else end = Math.max(end, b);
    }
    if (start !== -Infinity) covered += Math.max(0, end - start);
    area += (x1 - x0) * covered;
  }
  const total = boxArea(face);
  return { near, coverage: total ? clamp(area / total, 0, 1) : 0 };
}

export function poseFromMatrix(matrix?: { data?: ArrayLike<number> } | ArrayLike<number>): Pose | null {
  const a = Array.isArray(matrix) || ArrayBuffer.isView(matrix) ? matrix as ArrayLike<number> : (matrix as { data?: ArrayLike<number> } | undefined)?.data;
  if (!a || a.length < 16 || !Array.from({ length: 16 }, (_, i) => Number.isFinite(a[i])).every(Boolean)) return null;
  // MediaPipe returns a column-major 4x4 rigid transform. Euler convention: ZYX.
  const r00 = a[0], r10 = a[1], r20 = a[2], r21 = a[6], r22 = a[10], r01 = a[4], r11 = a[5];
  const pitch = Math.asin(clamp(-r20, -1, 1));
  const yaw = Math.atan2(r10, r00);
  const roll = Math.atan2(r21, r22);
  return { yawDeg: yaw * 180 / Math.PI, pitchDeg: Object.is(pitch, -0) ? 0 : pitch * 180 / Math.PI, rollDeg: roll * 180 / Math.PI };
}

export function poseFromLandmarks(points: Point3[], width: number, height: number): Pose {
  if (points.length <= 291) return { yawDeg: 0, pitchDeg: 0, rollDeg: 0 };
  const left = points[33], right = points[263], nose = points[1], forehead = points[10], chin = points[152];
  const eyeMid = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
  const eyeWidth = distance(left, right, width, height) || 1;
  const yawDeg = clamp((nose.x - eyeMid.x) * width / eyeWidth * 75, -90, 90);
  const rollDeg = Math.atan2((right.y - left.y) * height, (right.x - left.x) * width) * 180 / Math.PI;
  const faceHeight = distance(forehead, chin, width, height) || 1;
  const pitchDeg = clamp(((eyeMid.y - forehead.y) * height / faceHeight - 0.32) * -110, -60, 60);
  return { yawDeg, pitchDeg, rollDeg };
}

export function largestFaceIndex(faces: Point3[][], width: number, height: number, previousCenter?: { x: number; y: number }): number {
  let best = -1, area = -1;
  const centers: Array<{ index: number; x: number; y: number }> = [];
  faces.forEach((points, i) => {
    const b = faceBox(points, width, height), a = b ? boxArea(b) : 0;
    if (b) centers.push({ index: i, x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
    if (a > area) { best = i; area = a; }
  });
  if (previousCenter && centers.length) {
    const closest = centers.reduce((a, b) => Math.hypot(b.x - previousCenter.x, b.y - previousCenter.y) < Math.hypot(a.x - previousCenter.x, a.y - previousCenter.y) ? b : a);
    if (Math.hypot(closest.x - previousCenter.x, closest.y - previousCenter.y) <= Math.hypot(width, height) * 0.25) return closest.index;
  }
  return best;
}
