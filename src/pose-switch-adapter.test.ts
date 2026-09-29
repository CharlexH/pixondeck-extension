import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';

test('the real shadcn Switch island supports toggling, controlled reset and disposal', async () => {
  const output = await build({
    entryPoints: [fileURLToPath(new URL('./pose-switch-adapter.ts', import.meta.url))],
    bundle: true, write: false, format: 'iife', globalName: 'PoseSwitch',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const dom = new JSDOM('<div id="mount"></div>', { runScripts: 'outside-only' });
  const adapter = dom.window.eval(output.outputFiles[0].text + "; PoseSwitch;");
  const changes: boolean[] = [];
  const mounted = adapter.mountPoseOverlaySwitch(dom.window.document.getElementById('mount'), '原图叠加', (checked: boolean) => changes.push(checked));
  const button = dom.window.document.querySelector('button')!;
  assert.equal(button.getAttribute('role'), 'switch');
  assert.equal(button.getAttribute('aria-label'), '原图叠加');
  assert.equal(button.getAttribute('aria-checked'), 'false');
  button.click();
  assert.equal(button.getAttribute('aria-checked'), 'true');
  assert.equal(button.dataset.state, 'checked');
  assert.deepEqual(changes, [true]);
  mounted.setChecked(false);
  assert.equal(button.getAttribute('aria-checked'), 'false');
  assert.deepEqual(changes, [true]);
  mounted.dispose(); mounted.dispose();
  assert.equal(dom.window.document.querySelector('button'), null);
  dom.window.close();
});
