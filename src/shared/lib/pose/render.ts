import type { PoseResult, PosePoint } from "./protocol";
// ControlNet annotator/openpose/util.py: body18 order and its 17 rendered limbs.
export const OPENPOSE_COLORS = [
  "#ff0000",
  "#ff5500",
  "#ffaa00",
  "#ffff00",
  "#aaff00",
  "#55ff00",
  "#00ff00",
  "#00ff55",
  "#00ffaa",
  "#00ffff",
  "#00aaff",
  "#0055ff",
  "#0000ff",
  "#5500ff",
  "#aa00ff",
  "#ff00ff",
  "#ff00aa",
  "#ff0055",
];
export const OPENPOSE_EDGES = [
  [1, 2],
  [1, 5],
  [2, 3],
  [3, 4],
  [5, 6],
  [6, 7],
  [1, 8],
  [8, 9],
  [9, 10],
  [1, 11],
  [11, 12],
  [12, 13],
  [1, 0],
  [0, 14],
  [14, 16],
  [0, 15],
  [15, 17],
];
export function openPosePoints(result: PoseResult): Array<PosePoint | null> {
  const p = result.points;
  const get = (i: number) => (p[i]?.stable ? p[i] : null);
  const left = get(5),
    right = get(6);
  const neck =
    left && right
      ? {
          x: (left.x + right.x) / 2,
          y: (left.y + right.y) / 2,
          score: Math.min(left.score, right.score),
          stable: true,
        }
      : null;
  return [
    get(0),
    neck,
    get(6),
    get(8),
    get(10),
    get(5),
    get(7),
    get(9),
    get(12),
    get(14),
    get(16),
    get(11),
    get(13),
    get(15),
    get(2),
    get(1),
    get(4),
    get(3),
  ];
}
export async function renderPose(
  result: PoseResult,
  original?: ImageBitmap,
): Promise<Blob> {
  const width = original?.width ?? result.width,
    height = original?.height ?? result.height;
  const canvas = new OffscreenCanvas(width, height),
    ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-unavailable");
  if (original) ctx.drawImage(original, 0, 0);
  else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
  }
  const points = openPosePoints(result);
  const sx = width / result.width,
    sy = height / result.height,
    r = Math.max(3, Math.round((Math.min(width, height) * 4) / 512));
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p) continue;
    ctx.fillStyle = OPENPOSE_COLORS[i];
    ctx.beginPath();
    ctx.arc(p.x * sx, p.y * sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < OPENPOSE_EDGES.length; i++) {
    const [a, b] = OPENPOSE_EDGES[i],
      p = points[a],
      q = points[b];
    if (!p || !q) continue;
    const x1 = p.x * sx,
      y1 = p.y * sy,
      x2 = q.x * sx,
      y2 = q.y * sy;
    ctx.fillStyle = OPENPOSE_COLORS[i];
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(
      (x1 + x2) / 2,
      (y1 + y2) / 2,
      Math.max(1, Math.hypot(x2 - x1, y2 - y1) / 2),
      r,
      Math.atan2(y2 - y1, x2 - x1),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvas.convertToBlob({ type: "image/png" });
}
