import { PoseClient } from "./shared/lib/pose/client";
import { createPoseModelManager } from "./shared/lib/pose/model-cache";
import { config } from "./config";

export { POSE_MODEL_TOTAL_BYTES } from "./shared/lib/pose/model-manifest";
export type { PoseDownloadProgress } from "./shared/lib/pose/model-cache";
export type { PoseResult } from "./shared/lib/pose/protocol";

/** Model data is downloaded only on demand; executable runtime stays in the extension. */
export function createExtensionPoseRuntime(options?: { origin: string; workerUrl: string; runtimeUrl: string }) {
  const models = createPoseModelManager({ origin: options?.origin ?? new URL(config.siteOrigin).origin });
  const client = new PoseClient({
    workerFactory: () => new Worker(options?.workerUrl ?? chrome.runtime.getURL("pose-worker.js"), { type: "module" }),
    runtimeUrl: options?.runtimeUrl ?? chrome.runtime.getURL("pose-runtime/"),
  });
  let generation = 0;
  let loading: AbortController | undefined;

  function cancel() {
    generation++;
    loading?.abort();
    loading = undefined;
    client.cancel();
  }

  async function initialize(signal?: AbortSignal) {
    cancel();
    const current = generation;
    const controller = new AbortController();
    loading = controller;
    const abort = () => {
      controller.abort();
      if (current === generation) client.cancel();
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    try {
      const detector = await models.load("detector", controller.signal);
      const pose = await models.load("pose", controller.signal);
      if (controller.signal.aborted || current !== generation)
        throw new DOMException("Initialization cancelled", "AbortError");
      await client.initialize(detector, pose);
    } finally {
      signal?.removeEventListener("abort", abort);
      if (loading === controller) loading = undefined;
    }
  }

  async function deleteModels() {
    cancel();
    await models.delete();
  }

  function dispose() {
    cancel();
    models.cancel();
  }

  return { models, client, initialize, cancel, deleteModels, dispose };
}
