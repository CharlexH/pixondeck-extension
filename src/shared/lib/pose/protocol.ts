export type PoseStatus =
  | "candidate-complete"
  | "partial"
  | "unstable"
  | "no-person"
  | "ambiguous-person"
  | "unavailable";
export interface PosePoint {
  x: number;
  y: number;
  score: number;
  stable: boolean;
}
export interface PoseResult {
  width: number;
  height: number;
  points: PosePoint[];
  status: PoseStatus;
  reasons: string[];
  visibleCount: number;
  stableCount: number;
  elapsedMs: number;
  backend: "wasm";
  people: number;
}
export type PoseWorkerRequest =
  | {
      type: "init";
      id: string;
      detector: Uint8Array;
      pose: Uint8Array;
      runtimeUrl: string;
    }
  | { type: "infer"; id: string; image: ImageBitmap };
export type PoseWorkerResponse =
  | { type: "ready"; id: string }
  | { type: "result"; id: string; result: PoseResult }
  | { type: "error"; id: string; message: string };
