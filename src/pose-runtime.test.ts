import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function fixture() {
  const download = new AbortController();
  let inferenceCancellations = 0;
  let cacheDeleted = false;
  const models = {
    cancel: () => download.abort(),
    delete: async () => { download.abort(); cacheDeleted = true; },
  };
  class Client {
    cancel() { inferenceCancellations++; }
  }
  const exports: Record<string, any> = {};
  const source = readFileSync(new URL("./pose-runtime.ts", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports, AbortController, DOMException, URL,
    chrome: { runtime: { getURL: (path: string) => `chrome-extension://test/${path}` } },
    require: (path: string) => {
      if (path.endsWith("/client")) return { PoseClient: Client };
      if (path.endsWith("/model-cache")) return { createPoseModelManager: () => models };
      if (path.endsWith("/model-manifest")) return { POSE_MODEL_TOTAL_BYTES: 100 };
      if (path === "./config") return { config: { siteOrigin: "https://example.com" } };
      throw new Error(`Unexpected dependency ${path}`);
    },
  });
  return {
    runtime: exports.createExtensionPoseRuntime(),
    download: download.signal,
    cancellations: () => inferenceCancellations,
    deleted: () => cacheDeleted,
  };
}

test("switching images cancels inference while preserving an explicit model download", () => {
  const f = fixture();
  f.runtime.cancel();
  assert.equal(f.cancellations(), 1);
  assert.equal(f.download.aborted, false);
  f.runtime.dispose();
  assert.equal(f.download.aborted, true);
});

test("deleting models cancels inference and downloads before removing the cache", async () => {
  const f = fixture();
  await f.runtime.deleteModels();
  assert.equal(f.cancellations(), 1);
  assert.equal(f.download.aborted, true);
  assert.equal(f.deleted(), true);
});
