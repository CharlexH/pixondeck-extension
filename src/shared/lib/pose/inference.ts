import * as ort from "onnxruntime-web/wasm";
import { cropGeometry, decodeBoxes, diagnose, type Box } from "./geometry";
import type { PosePoint, PoseResult } from "./protocol";
interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
// RTMLib/OpenCV models consume BGR, not RGB. Keep the pinned model convention.
function sample(im: Pixels, x: number, y: number, c: number, border: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy;
  const get = (a: number, b: number) =>
    a < 0 || b < 0 || a >= im.width || b >= im.height
      ? border
      : im.data[(b * im.width + a) * 4 + 2 - c];
  return (
    (get(ix, iy) * (1 - fx) + get(ix + 1, iy) * fx) * (1 - fy) +
    (get(ix, iy + 1) * (1 - fx) + get(ix + 1, iy + 1) * fx) * fy
  );
}
function detectorInput(im: Pixels) {
  const r = Math.min(640 / im.width, 640 / im.height),
    rw = Math.floor(im.width * r),
    rh = Math.floor(im.height * r),
    a = new Float32Array(3 * 640 * 640);
  a.fill(114);
  for (let c = 0; c < 3; c++)
    for (let y = 0; y < rh; y++)
      for (let x = 0; x < rw; x++)
        a[c * 640 * 640 + y * 640 + x] = Math.round(
          sample(
            im,
            Math.max(0, ((x + 0.5) * im.width) / rw - 0.5),
            Math.max(0, ((y + 0.5) * im.height) / rh - 0.5),
            c,
            114,
          ),
        );
  return { a, r };
}
function poseInput(im: Pixels, b: Box) {
  const g = cropGeometry(b),
    a = new Float32Array(3 * 192 * 256);
  const mean = [123.675, 116.28, 103.53],
    std = [58.395, 57.12, 57.375];
  for (let c = 0; c < 3; c++)
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 192; x++) {
        // OpenCV warpAffine INTER_LINEAR quantizes fractions to 1/32.
        const sx = Math.round(((x * g.w) / 192 + g.cx - g.w / 2) * 32) / 32,
          sy = Math.round(((y * g.h) / 256 + g.cy - g.h / 2) * 32) / 32;
        a[c * 192 * 256 + y * 192 + x] =
          (Math.round(sample(im, sx, sy, c, 0)) - mean[c]) / std[c];
      }
  return { a, g };
}
export class PoseInference {
  private constructor(
    private detector: ort.InferenceSession,
    private pose: ort.InferenceSession,
  ) {}
  static async create(
    detector: Uint8Array,
    pose: Uint8Array,
    runtimeUrl: string,
  ) {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = runtimeUrl;
    const options: ort.InferenceSession.SessionOptions = {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    };
    const d = await ort.InferenceSession.create(detector, options);
    try {
      return new PoseInference(
        d,
        await ort.InferenceSession.create(pose, options),
      );
    } catch (e) {
      await d.release();
      throw e;
    }
  }
  private async run(im: Pixels) {
    const { a, r } = detectorInput(im);
    const input = new ort.Tensor("float32", a, [1, 3, 640, 640]);
    let ds: ort.InferenceSession.ReturnType | undefined;
    let boxes: Box[];
    try {
      ds = await this.detector.run({ [this.detector.inputNames[0]]: input });
      const output = ds[this.detector.outputNames[0]];
      if (
        output.dims.length !== 3 ||
        output.dims[2] !== 5 ||
        !(output.data instanceof Float32Array)
      )
        throw new Error("invalid-detector-output");
      boxes = decodeBoxes(output.data, 5, r);
    } finally {
      input.dispose();
      if (ds) Object.values(ds).forEach((t) => t.dispose());
    }
    boxes.sort(
      (a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]),
    );
    if (!boxes.length) return { points: [], boxes };
    const { a: pa, g } = poseInput(im, boxes[0]);
    const pin = new ort.Tensor("float32", pa, [1, 3, 256, 192]);
    let ps: ort.InferenceSession.ReturnType | undefined;
    try {
      ps = await this.pose.run({ [this.pose.inputNames[0]]: pin });
      const tx = ps[this.pose.outputNames[0]],
        ty = ps[this.pose.outputNames[1]],
        xd = tx.data as Float32Array,
        yd = ty.data as Float32Array;
      if (
        tx.dims.length !== 3 ||
        ty.dims.length !== 3 ||
        tx.dims[1] !== 133 ||
        ty.dims[1] !== 133 ||
        tx.dims[2] !== 384 ||
        ty.dims[2] !== 512 ||
        !(xd instanceof Float32Array) ||
        !(yd instanceof Float32Array)
      )
        throw new Error("invalid-pose-output");
      const points: PosePoint[] = [];
      for (let k = 0; k < 17; k++) {
        let xi = 0,
          yi = 0,
          xv = -Infinity,
          yv = -Infinity;
        for (let i = 0; i < tx.dims[2]; i++)
          if (xd[k * tx.dims[2] + i] > xv) {
            xv = xd[k * tx.dims[2] + i];
            xi = i;
          }
        for (let i = 0; i < ty.dims[2]; i++)
          if (yd[k * ty.dims[2] + i] > yv) {
            yv = yd[k * ty.dims[2] + i];
            yi = i;
          }
        points.push({
          x: (xi / 2 / 192) * g.w + g.cx - g.w / 2,
          y: (yi / 2 / 256) * g.h + g.cy - g.h / 2,
          score: (xv + yv) / 2,
          stable: false,
        });
      }
      return { points, boxes };
    } finally {
      pin.dispose();
      if (ps) Object.values(ps).forEach((t) => t.dispose());
    }
  }
  async infer(image: ImageBitmap): Promise<PoseResult> {
    const started = performance.now(),
      scale = Math.min(1, 960 / Math.max(image.width, image.height)),
      w = Math.round(image.width * scale),
      h = Math.round(image.height * scale);
    const c = new OffscreenCanvas(w, h),
      ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas-unavailable");
    ctx.drawImage(image, 0, 0, w, h);
    const source = ctx.getImageData(0, 0, w, h);
    const first = await this.run(source);
    ctx.setTransform(-1, 0, 0, 1, w, 0);
    ctx.drawImage(image, 0, 0, w, h);
    const flipped = first.points.length
      ? await this.run(ctx.getImageData(0, 0, w, h))
      : { points: [], boxes: [] };
    const area = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);
    const ambiguous =
      first.boxes.length > 1 &&
      area(first.boxes[1]) >= area(first.boxes[0]) * 0.25;
    return diagnose(
      first.points,
      flipped.points,
      w,
      h,
      first.boxes.length,
      ambiguous,
      performance.now() - started,
    );
  }
  async dispose() {
    await this.detector.release();
    await this.pose.release();
  }
}
