import type {
  PoseResult,
  PoseWorkerRequest,
  PoseWorkerResponse,
} from "./protocol";
export interface PoseClientOptions {
  workerFactory?: () => Worker;
  runtimeUrl?: string;
}
export class PoseClient {
  constructor(private readonly options: PoseClientOptions = {}) {}
  private worker: Worker | null = null;
  private pending: {
    id: string;
    resolve: (value: PoseResult | undefined) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private request(
    message: PoseWorkerRequest,
    transfer: Transferable[],
  ): Promise<PoseResult | undefined> {
    if (this.pending) return Promise.reject(new Error("busy"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.cancel("inference-timeout"), 120000);
      this.pending = { id: message.id, resolve, reject, timer };
      try {
        this.worker!.postMessage(message, transfer);
      } catch (e) {
        this.cancel(e instanceof Error ? e.message : "worker-unavailable");
      }
    });
  }
  async initialize(detector: Uint8Array, pose: Uint8Array) {
    this.cancel();
    this.worker = this.options.workerFactory?.() ?? new Worker(
      new URL("../../workers/pose.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = ({ data }: MessageEvent<PoseWorkerResponse>) => {
      const p = this.pending;
      if (!p || data.id !== p.id) return;
      clearTimeout(p.timer);
      this.pending = null;
      if (data.type === "error") p.reject(new Error(data.message));
      else p.resolve(data.type === "result" ? data.result : undefined);
    };
    this.worker.onerror = () => this.cancel("worker-failed");
    this.worker.onmessageerror = () => this.cancel("worker-message-failed");
    await this.request(
      {
        type: "init",
        id: crypto.randomUUID(),
        detector,
        pose,
        runtimeUrl: this.options.runtimeUrl ?? new URL("/models/pose/runtime/", location.origin).href,
      },
      [detector.buffer as ArrayBuffer, pose.buffer as ArrayBuffer],
    );
  }
  async infer(image: ImageBitmap): Promise<PoseResult> {
    if (!this.worker) throw new Error("not-ready");
    return (await this.request(
      { type: "infer", id: crypto.randomUUID(), image },
      [image],
    ))!;
  }
  cancel(message = "cancelled") {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error(message));
      this.pending = null;
    }
    this.worker?.terminate();
    this.worker = null;
  }
  dispose() {
    this.cancel();
  }
}
