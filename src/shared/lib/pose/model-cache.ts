import {
  POSE_MODELS,
  type PoseModelSpec,
  type PoseModelChunk,
} from "./model-manifest.ts";

export type PoseModelErrorCode =
  "quota" | "integrity" | "evicted" | "network" | "unavailable";
export class PoseModelError extends Error {
  readonly code: PoseModelErrorCode;
  constructor(code: PoseModelErrorCode, message: string) {
    super(message);
    this.name = "PoseModelError";
    this.code = code;
  }
}

const CACHE_NAME = "pixondeck-pose-models-v1";
interface CacheLike {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
}
interface StorageLike {
  open(name: string): Promise<CacheLike>;
  delete(name: string): Promise<boolean>;
}
export interface PoseDownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
}
interface Dependencies {
  models?: readonly PoseModelSpec[];
  cacheStorage?: StorageLike;
  fetch?: typeof fetch;
  origin?: string;
}
export interface PoseDownloadOptions {
  signal?: AbortSignal;
  onProgress?: (value: PoseDownloadProgress) => void;
}
function abort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("Download cancelled", "AbortError");
}
async function digest(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer)),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
async function valid(
  bytes: Uint8Array,
  spec: { byteLength: number; sha256: string },
) {
  return (
    bytes.byteLength === spec.byteLength &&
    (await digest(bytes)) === spec.sha256
  );
}

/** One manager owns the model lifecycle. Cache stores verified model bytes, never user images. */
export function createPoseModelManager(dependencies: Dependencies = {}) {
  const models = dependencies.models ?? POSE_MODELS;
  const storage = dependencies.cacheStorage ?? globalThis.caches;
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const origin = dependencies.origin ?? globalThis.location?.origin;
  if (!storage || !origin)
    throw new PoseModelError(
      "unavailable",
      "Pose model storage requires a secure browser context.",
    );
  const totalBytes = models.reduce((n, m) => n + m.totalByteLength, 0);
  const urls = new Map<PoseModelChunk, string>();
  const seen = new Set<string>();
  for (const model of models) {
    if (
      !/^[a-f0-9]{64}$/.test(model.sha256) ||
      model.chunks.length === 0 ||
      model.chunks.reduce((n, c) => n + c.byteLength, 0) !==
        model.totalByteLength
    )
      throw new Error("Invalid pose model manifest.");
    for (const chunk of model.chunks) {
      const url = new URL(chunk.url, origin);
      if (
        url.origin !== origin ||
        !Number.isSafeInteger(chunk.byteLength) ||
        chunk.byteLength <= 0 ||
        !/^[a-f0-9]{64}$/.test(chunk.sha256) ||
        seen.has(url.href)
      )
        throw new Error("Invalid pose model chunk.");
      seen.add(url.href);
      urls.set(chunk, url.href);
    }
  }
  let active:
    | {
        controller: AbortController;
        promise: Promise<void>;
        listeners: Set<(p: PoseDownloadProgress) => void>;
      }
    | undefined;
  let deleting: Promise<void> | undefined;
  let epoch = 0;
  // Serialize persistent cache mutations across tabs when Web Locks is available.
  // One manager remains the lifecycle owner within a tab.
  async function exclusively<T>(
    action: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const locks = globalThis.navigator?.locks;
    return locks
      ? await locks.request(CACHE_NAME, { signal }, action)
      : await action();
  }
  async function cached(cache: CacheLike, chunk: PoseModelChunk) {
    const url = urls.get(chunk)!;
    const response = await cache.match(url);
    if (!response) return undefined;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (await valid(bytes, chunk)) return bytes;
    await cache.delete(url);
    return undefined;
  }
  async function inspect() {
    if (deleting) {
      await deleting;
      return { ready: false, verifiedBytes: 0, totalBytes };
    }
    const generation = epoch;
    return exclusively(async () => {
      if (generation !== epoch)
        return { ready: false, verifiedBytes: 0, totalBytes };
      const cache = await storage.open(CACHE_NAME);
      let verifiedBytes = 0;
      for (const model of models)
        for (const chunk of model.chunks)
          if (await cached(cache, chunk)) verifiedBytes += chunk.byteLength;
      if (generation !== epoch)
        return { ready: false, verifiedBytes: 0, totalBytes };
      return { ready: verifiedBytes === totalBytes, verifiedBytes, totalBytes };
    });
  }
  async function load(id: string, signal?: AbortSignal): Promise<Uint8Array> {
    if (deleting)
      throw new DOMException("Model deletion in progress", "AbortError");
    const generation = epoch;
    const model = models.find((m) => m.id === id);
    if (!model) throw new Error("Unknown pose model.");
    const cache = await storage.open(CACHE_NAME);
    const result = new Uint8Array(model.totalByteLength);
    let offset = 0;
    for (const chunk of model.chunks) {
      abort(signal);
      const bytes = await cached(cache, chunk);
      if (!bytes)
        throw new PoseModelError(
          "evicted",
          "Pose model is missing or was evicted. Download it again.",
        );
      result.set(bytes, offset);
      offset += bytes.byteLength;
    }
    abort(signal);
    if ((await digest(result)) !== model.sha256)
      throw new PoseModelError(
        "integrity",
        "Pose model integrity verification failed.",
      );
    if (generation !== epoch)
      throw new DOMException("Model deleted during load", "AbortError");
    return result;
  }
  async function download(options: PoseDownloadOptions = {}) {
    abort(options.signal);
    if (deleting)
      throw new DOMException("Model deletion in progress", "AbortError");
    abort(options.signal);
    if (!active) {
      const controller = new AbortController();
      const listeners = new Set<(p: PoseDownloadProgress) => void>();
      const state = { controller, listeners, promise: Promise.resolve() };
      active = state;
      state.promise = exclusively(async () => {
        const signal = controller.signal;
        const cache = await storage.open(CACHE_NAME);
        let completed = 0;
        const report = (bytes: number) =>
          listeners.forEach((fn) => fn({ downloadedBytes: bytes, totalBytes }));
        for (const model of models) {
          const assembled = new Uint8Array(model.totalByteLength);
          let offset = 0;
          for (const chunk of model.chunks) {
            abort(signal);
            let bytes = await cached(cache, chunk);
            abort(signal);
            if (!bytes) {
              const response = await fetcher(urls.get(chunk)!, {
                signal,
                cache: "no-store",
              });
              if (!response.ok)
                throw new PoseModelError(
                  "network",
                  `Pose model download failed (${response.status}). Retry the download.`,
                );
              const reader = response.body?.getReader();
              if (!reader)
                throw new PoseModelError(
                  "network",
                  "Model download has no response body.",
                );
              const output = new Uint8Array(chunk.byteLength);
              let received = 0;
              const cancel = () => {
                void reader.cancel().catch(() => undefined);
              };
              signal.addEventListener("abort", cancel, { once: true });
              try {
                while (true) {
                  abort(signal);
                  const part = await reader.read();
                  abort(signal);
                  if (part.done) break;
                  if (received + part.value.byteLength > output.byteLength)
                    throw new PoseModelError(
                      "integrity",
                      "Pose model download exceeds expected size.",
                    );
                  output.set(part.value, received);
                  received += part.value.byteLength;
                  report(completed + received);
                }
              } finally {
                signal.removeEventListener("abort", cancel);
                await reader.cancel().catch(() => undefined);
                reader.releaseLock();
              }
              bytes = output.subarray(0, received);
              if (!(await valid(bytes, chunk)))
                throw new PoseModelError(
                  "integrity",
                  "Pose model download integrity check failed. Retry the download.",
                );
              abort(signal);
              try {
                await cache.put(
                  urls.get(chunk)!,
                  new Response(new Uint8Array(bytes).buffer),
                );
              } catch (error) {
                if (
                  error instanceof DOMException &&
                  error.name === "QuotaExceededError"
                )
                  throw new PoseModelError(
                    "quota",
                    "Not enough browser storage for pose models. Free storage and retry.",
                  );
                throw error;
              }
              abort(signal);
            }
            assembled.set(bytes, offset);
            offset += bytes.byteLength;
            completed += bytes.byteLength;
            report(completed);
          }
          if ((await digest(assembled)) !== model.sha256) {
            await Promise.all(
              model.chunks.map((c) => cache.delete(urls.get(c)!)),
            );
            throw new PoseModelError(
              "integrity",
              "Pose model integrity verification failed.",
            );
          }
          abort(signal);
        }
      }, controller.signal)
        .catch((error: unknown) => {
          if (error instanceof TypeError)
            throw new PoseModelError(
              "network",
              "Pose model download failed. Check connection and retry.",
            );
          throw error;
        })
        .finally(() => {
          if (active === state) active = undefined;
        });
    }
    const state = active;
    if (options.onProgress) state.listeners.add(options.onProgress);
    const cancel = () => state.controller.abort();
    options.signal?.addEventListener("abort", cancel, { once: true });
    try {
      await state.promise;
    } finally {
      options.signal?.removeEventListener("abort", cancel);
      if (options.onProgress) state.listeners.delete(options.onProgress);
    }
  }
  function cancel() {
    active?.controller.abort();
  }
  async function remove() {
    if (deleting) return deleting;
    epoch++;
    cancel();
    const running = active?.promise;
    deleting = (async () => {
      await running?.catch(() => undefined);
      await exclusively(async () => {
        await storage.delete(CACHE_NAME);
      });
    })().finally(() => {
      deleting = undefined;
    });
    return deleting;
  }
  return { inspect, download, load, cancel, delete: remove };
}
export type PoseModelManager = ReturnType<typeof createPoseModelManager>;
