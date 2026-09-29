import type { PosePoint, PoseResult } from "./protocol";
export type Box = [number, number, number, number, number];
export const FLIP17 = [
  0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15,
];
export function validPoint(p: PosePoint, w: number, h: number) {
  return (
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Number.isFinite(p.score) &&
    p.score >= 0.5 &&
    p.x >= 0 &&
    p.x < w &&
    p.y >= 0 &&
    p.y < h
  );
}
export function iou(a: Box, b: Box) {
  const area = (r: Box) =>
    Math.max(0, r[2] - r[0] + 1) * Math.max(0, r[3] - r[1] + 1);
  const inter =
    Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]) + 1) *
    Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]) + 1);
  return inter / (area(a) + area(b) - inter);
}
export function decodeBoxes(
  data: Float32Array,
  columns: number,
  ratio: number,
): Box[] {
  if (columns === 5) {
    const boxes: Box[] = [];
    for (let i = 0; i < data.length; i += 5) {
      if (
        data[i + 4] > 0.3 &&
        Array.from(data.subarray(i, i + 5)).every(Number.isFinite) &&
        data[i + 2] > data[i] &&
        data[i + 3] > data[i + 1]
      )
        boxes.push([
          data[i] / ratio,
          data[i + 1] / ratio,
          data[i + 2] / ratio,
          data[i + 3] / ratio,
          data[i + 4],
        ]);
    }
    return boxes;
  }
  const candidates: Box[] = [];
  let row = 0;
  for (const stride of [8, 16, 32])
    for (let y = 0; y < 640 / stride; y++)
      for (let x = 0; x < 640 / stride; x++, row++) {
        const i = row * columns;
        const score = data[i + 4] * data[i + 5];
        if (score <= 0.7) continue;
        const cx = (data[i] + x) * stride,
          cy = (data[i + 1] + y) * stride,
          w = Math.exp(data[i + 2]) * stride,
          h = Math.exp(data[i + 3]) * stride;
        candidates.push([
          (cx - w / 2) / ratio,
          (cy - h / 2) / ratio,
          (cx + w / 2) / ratio,
          (cy + h / 2) / ratio,
          score,
        ]);
      }
  candidates.sort((a, b) => b[4] - a[4]);
  const keep: Box[] = [];
  for (const b of candidates)
    if (!keep.some((a) => iou(a, b) > 0.45)) keep.push(b);
  return keep;
}
export function cropGeometry(b: Box) {
  const cx = (b[0] + b[2]) / 2,
    cy = (b[1] + b[3]) / 2;
  let w = (b[2] - b[0]) * 1.25,
    h = (b[3] - b[1]) * 1.25;
  if (w > h * 0.75) h = w / 0.75;
  else w = h * 0.75;
  return { cx, cy, w, h };
}
export function diagnose(
  points: PosePoint[],
  mirror: PosePoint[],
  width: number,
  height: number,
  people: number,
  ambiguous: boolean,
  elapsedMs: number,
): PoseResult {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    (people > 0 && points.length !== 17)
  ) {
    return {
      width,
      height,
      points: [],
      status: "unavailable",
      reasons: ["invalid-output"],
      visibleCount: 0,
      stableCount: 0,
      elapsedMs,
      backend: "wasm",
      people,
    };
  }
  const visible = points.map((p) => validPoint(p, width, height));
  const torso =
    visible[5] && visible[6] && visible[11] && visible[12]
      ? Math.hypot(
          (points[5].x + points[6].x - points[11].x - points[12].x) / 2,
          (points[5].y + points[6].y - points[11].y - points[12].y) / 2,
        )
      : 0;
  let unstable = false;
  for (let i = 0; i < points.length; i++) {
    const m = mirror[FLIP17[i]];
    const mx = m ? width - 1 - m.x : NaN;
    const ok = m && validPoint(m, width, height) && visible[i] && torso > 1;
    const error = ok
      ? Math.hypot(points[i].x - mx, points[i].y - m.y) / torso
      : Infinity;
    points[i].stable = !!ok && error <= 0.2;
    if (i >= 5 && ok && error > 0.2) unstable = true;
  }
  const limbs = points.slice(5);
  const count = visible.slice(5).filter(Boolean).length;
  const stableCount = limbs.filter((p) => p.stable).length;
  const status = !people
    ? "no-person"
    : ambiguous
      ? "ambiguous-person"
      : unstable
        ? "unstable"
        : count === 12 && stableCount === 12
          ? "candidate-complete"
          : "partial";
  const reasons: string[] = [];
  if (!people) reasons.push("no-person");
  if (ambiguous) reasons.push("multiple-people");
  if (count < 12) reasons.push("missing-joints");
  if (torso <= 1) reasons.push("missing-torso");
  if (unstable) reasons.push("mirror-disagreement");
  return {
    width,
    height,
    points,
    status,
    reasons,
    visibleCount: count,
    stableCount,
    elapsedMs,
    backend: "wasm",
    people,
  };
}
