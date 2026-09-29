import { PoseInference } from "../lib/pose/inference";
import type {
  PoseWorkerRequest,
  PoseWorkerResponse,
} from "../lib/pose/protocol";
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PoseWorkerRequest>) => void) | null;
  postMessage: (message: PoseWorkerResponse) => void;
};
let runtime: PoseInference | undefined;
let busy = false;
scope.onmessage = async ({ data }) => {
  if (busy) {
    if (data.type === "infer") data.image.close();
    scope.postMessage({ type: "error", id: data.id, message: "busy" });
    return;
  }
  busy = true;
  try {
    if (data.type === "init") {
      await runtime?.dispose();
      runtime = await PoseInference.create(
        data.detector,
        data.pose,
        data.runtimeUrl,
      );
      scope.postMessage({ type: "ready", id: data.id });
    } else {
      if (!runtime) throw new Error("not-ready");
      const result = await runtime.infer(data.image);
      scope.postMessage({ type: "result", id: data.id, result });
    }
  } catch (error) {
    scope.postMessage({
      type: "error",
      id: data.id,
      message: error instanceof Error ? error.message : "inference-failed",
    });
  } finally {
    if (data.type === "infer") data.image.close();
    busy = false;
  }
};
