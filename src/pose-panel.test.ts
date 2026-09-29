import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
import { exportPoseData } from './pose-export.ts';
import { poseMessages } from './pose-messages.ts';
import { PoseSelection, canPreviewPose } from './pose-selection.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(cache = new Map<string, any>(), preferences = new Map<string, string>()) {
  const dom = new JSDOM(readFileSync(new URL('./panel.html', import.meta.url), 'utf8'));
  const document = dom.window.document;
  if (!document.getElementById('poseConfirm')) document.body.insertAdjacentHTML('beforeend', '<dialog id=poseConfirm><h2 id=poseConfirmTitle></h2><p id=poseConfirmDescription></p><button id=poseConfirmStart></button><button id=poseConfirmCancel></button></dialog>');
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; };
  }
  let downloads = 0, deletes = 0, inferences = 0, renders = 0, ready = false;
  let resolveInference: (value: unknown) => void = () => {};
  const runtime = {
    models: {
      inspect: async () => ({ ready }),
      download: ({ signal, onProgress }: { signal: AbortSignal; onProgress: (p: unknown) => void }) => {
        downloads++;
        onProgress({ downloadedBytes: 50, totalBytes: 100 });
        return new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled'))));
      },
    },
    initialize: async () => {}, cancel() {}, dispose() {},
    deleteModels: async () => { deletes++; ready = false; },
    client: { infer: async () => { inferences++; return await new Promise(resolve => { resolveInference = resolve; }); } },
  };
  const context = {
    document, poseMessages, exportPoseData, PoseSelection, canPreviewPose, AbortController, Blob, URL, setTimeout,
    localStorage: { getItem: (key: string) => preferences.get(key) ?? null, setItem: (key: string, value: string) => preferences.set(key, value) },
    poseCache: { get: async (key: string) => cache.get(key) ?? null, set: async (entry: any) => { cache.set(entry.key, entry); }, remove: async (key: string) => {cache.delete(key);} },
    mountPoseOverlaySwitch: (container: HTMLElement, label: string, onChange: (checked: boolean) => void, id = 'poseOverlay') => {
      const button = document.createElement('button'); button.id = id; button.setAttribute('role', 'switch'); button.setAttribute('aria-label', label);
      const setChecked = (value: boolean) => button.setAttribute('aria-checked', String(value)); setChecked(false);
      button.onclick = () => { const checked = button.getAttribute('aria-checked') !== 'true'; setChecked(checked); onChange(checked); };
      container.append(button); return { setChecked, dispose() { button.remove(); } };
    },
    createExtensionPoseRuntime: () => runtime,
    createImageBitmap: async () => ({ close() {} }),
    renderPose: async () => { renders++; return new Blob(['png']); },
    createPosePanel: undefined as any,
  };
  const source = readFileSync(new URL('./pose-panel.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export function', 'function');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, context);
  const panel = context.createPosePanel('en', async () => new Blob(['image']));
  const el = (id: string) => document.getElementById(id) as HTMLButtonElement;
  return { panel, el, dom, cache, setReady: () => { ready = true; }, finish: (status: string) => resolveInference({ status, points: [] }), counts: () => ({ downloads, deletes, inferences, renders }) };
}

test('model download is opt-in, progress and cancellation allow retry, deletion clears model', async () => {
  const f = fixture();
  f.panel.select('image-a');
  assert.equal(f.counts().downloads, 0);
  f.el('poseSettingsOpen').click(); await tick();
  assert.equal(f.counts().downloads, 0);
  f.el('poseDownload').click(); await tick();
  assert.equal(f.el('poseModelStatus').textContent, 'Downloading 50%');
  assert.equal(f.el('poseDownload').disabled, true);
  f.el('poseCancelDownload').click(); await tick();
  assert.match(f.el('poseModelStatus').textContent!, /cancelled/);
  assert.equal(f.el('poseDownload').disabled, false);
  f.el('poseDownload').click(); await tick();
  assert.equal(f.counts().downloads, 2);
  f.el('poseCancelDownload').click(); await tick();
  f.el('poseDelete').click(); await tick();
  assert.equal(f.counts().deletes, 1);
  assert.match(f.el('poseModelStatus').textContent!, /deleted/);
  f.panel.dispose(); f.dom.window.close();
});

test('recognition with missing model opens settings without downloading or inferring', async () => {
  const f = fixture(); f.panel.select('image-a'); await tick(); f.el('poseRecognize').click(); f.el('poseConfirmStart').click(); await tick();
  assert.equal(f.counts().downloads, 0); assert.equal(f.counts().inferences, 0);
  assert.equal((f.el('poseSettings') as unknown as HTMLDialogElement).open, true);
  f.panel.dispose(); f.dom.window.close();
});

test('selection changes discard pending inference and never show a stale preview', async () => {
  const f = fixture(); f.setReady(); f.panel.select('image-a');
  await tick(); f.el('poseRecognize').click(); f.el('poseConfirmStart').click(); await tick();
  assert.equal(f.counts().inferences, 1);
  f.panel.select('image-b'); f.finish('candidate-complete'); await tick();
  assert.equal(f.counts().renders, 0);
  assert.equal(f.panel.getReference(), null);
  assert.equal(f.el('poseStatus').textContent, '');
  f.panel.dispose(); f.dom.window.close();
});

test('uncertain result shows rejection and cannot produce skeleton downloads', async () => {
  const f = fixture(); f.setReady(); f.panel.select('image-a');
  await tick(); f.el('poseRecognize').click(); f.el('poseConfirmStart').click(); await tick(); f.finish('unstable'); await tick();
  assert.equal(f.counts().renders, 0); assert.equal(f.panel.getReference(), null);
  assert.match(f.el('poseStatus').textContent!, /uncertain/);
  f.panel.dispose(); f.dom.window.close();
});

test('candidate and partial poses expose inspectable skeleton and overlay previews', async () => {
  for (const status of ['candidate-complete', 'partial']) {
    const f = fixture(); f.setReady(); f.panel.select('image-a');
    await tick(); f.el('poseRecognize').click(); f.el('poseConfirmStart').click(); await tick(); f.finish(status); await tick();
    assert.equal(f.counts().renders, 2); assert.ok(f.panel.getReference());
    assert.equal((f.el('poseViewer') as unknown as HTMLDialogElement).open, true);
    f.el('poseOverlay').click(); assert.equal(f.el('poseOverlay').getAttribute('aria-checked'), 'true');
    f.panel.select(null); assert.equal(f.panel.getReference(), null);
    f.panel.dispose(); f.dom.window.close();
  }
});

test('pose messages cover both supported extension languages', () => {
  assert.deepEqual(Object.keys(poseMessages.en), Object.keys(poseMessages['zh-CN']));
  for (const value of Object.values(poseMessages['zh-CN'])) assert.match(value, /[\u4e00-\u9fff]/);
});

test('cancel and disposal invalidate late recognition without rendering', async () => {
  for (const action of ['cancel', 'dispose']) {
    const f = fixture(); f.setReady(); f.panel.select('image-a');
    await tick(); f.el('poseRecognize').click(); f.el('poseConfirmStart').click(); await tick();
    if (action === 'cancel') f.el('poseRecognize').click(); else f.panel.dispose();
    f.finish('candidate-complete'); await tick();
    assert.equal(f.counts().renders, 0);
    assert.equal(f.panel.getReference(), null);
    f.panel.dispose(); f.dom.window.close();
  }
});


test('first recognition confirms, cached poses reopen directly and reference is always skeleton', async () => {
  const cache = new Map<string, any>();
  const f = fixture(cache); f.setReady(); f.panel.select('account-a:image-a'); await tick();
  f.el('poseRecognize').click(); await tick();
  assert.equal(f.counts().inferences, 0);
  assert.equal((f.el('poseConfirm') as unknown as HTMLDialogElement).open, true);
  f.el('poseConfirmStart').click(); await tick(); f.finish('candidate-complete'); await tick();
  const reference = f.panel.getReference(); assert.ok(reference);
  f.el('poseOverlay').click(); assert.equal(f.panel.getReference().blob, reference.blob);
  f.panel.dispose(); f.dom.window.close();
  const reopened = fixture(cache); reopened.panel.select('account-a:image-a'); await tick();
  assert.equal(reopened.panel.getReference().blob, reference.blob);
  reopened.el('poseRecognize').click();
  assert.equal((reopened.el('poseViewer') as unknown as HTMLDialogElement).open, true);
  assert.equal((reopened.el('poseConfirm') as unknown as HTMLDialogElement).open, false);
  reopened.el('poseIncludeSwitch').click(); await tick(); assert.equal(reopened.panel.getReference(), null);
  reopened.panel.select('account-b:image-a'); await tick(); assert.equal(reopened.panel.getReference(), null);
  reopened.panel.select('account-a:image-a'); await tick(); assert.equal(reopened.panel.getReference(), null);
  assert.equal(reopened.counts().inferences, 0);
  await reopened.panel.remove('account-a:image-a'); assert.equal(cache.size, 0);
  reopened.panel.dispose(); reopened.dom.window.close();
});


test('viewer uses a footer overlay switch and omits the removed explanatory text', () => {
  const f = fixture();
  for (const id of ['poseViewerStatus','poseLegend','poseIncludeHelp','poseSkeleton']) assert.equal(f.dom.window.document.getElementById(id), null);
  assert.equal(f.el('poseOverlay').getAttribute('role'), 'switch');
  assert.equal(f.el('poseOverlay').getAttribute('aria-label'), poseMessages.en.overlay);
  assert.ok(f.el('poseOverlay').closest('.pose-footer'));
  f.panel.dispose(); f.dom.window.close();
});


test('automatic recognition is opt-in, silent, cached and preferences persist', async () => {
  const preferences = new Map<string, string>();
  const cache = new Map<string, any>();
  const f = fixture(cache, preferences); f.setReady(); f.panel.select('account:image'); await tick();
  await f.panel.autoRecognize('account:image'); assert.equal(f.counts().inferences, 0);
  f.el('poseAutoSwitch').click();
  const pending = f.panel.autoRecognize('account:image'); await tick();
  assert.equal(f.counts().inferences, 1);
  assert.equal((f.el('poseConfirm') as unknown as HTMLDialogElement).open, false);
  f.finish('candidate-complete'); await pending;
  assert.equal((f.el('poseViewer') as unknown as HTMLDialogElement).open, false);
  assert.ok(f.panel.getReference());
  await f.panel.autoRecognize('account:image'); assert.equal(f.counts().inferences, 1);
  f.el('poseIncludeSwitch').click(); assert.equal(f.panel.getReference(), null);
  f.panel.dispose(); f.dom.window.close();
  const reopened = fixture(cache, preferences); reopened.panel.select('account:image'); await tick();
  assert.equal(reopened.el('poseAutoSwitch').getAttribute('aria-checked'), 'true');
  assert.equal(reopened.el('poseIncludeSwitch').getAttribute('aria-checked'), 'false');
  assert.equal(reopened.panel.getReference(), null);
  reopened.panel.dispose(); reopened.dom.window.close();
});
