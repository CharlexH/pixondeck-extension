import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir = process.argv.includes('--production') ? 'dist-production' : 'dist';
const manifest = JSON.parse(await readFile(`${dir}/manifest.json`, 'utf8'));
assert.match(manifest.content_security_policy.extension_pages, /'wasm-unsafe-eval'/);
assert.doesNotMatch(manifest.content_security_policy.extension_pages, /(?:https?:|\s'unsafe-eval')/);
assert.ok((await stat(`${dir}/pose-worker.js`)).size > 0);
for (const ext of ['mjs', 'wasm']) {
  const name = `ort-wasm-simd-threaded.${ext}`;
  const packaged = await readFile(`${dir}/pose-runtime/${name}`);
  const installed = await readFile(`node_modules/onnxruntime-web/dist/${name}`);
  const digest = value => createHash('sha256').update(value).digest('hex');
  assert.equal(digest(packaged), digest(installed), `ORT ${ext} must match the installed runtime`);
}
console.log('Pose package verified: local worker, matching ONNX runtime, WASM CSP. Browser inference not tested.');
