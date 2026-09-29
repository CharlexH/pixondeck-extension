import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { showChatGPTPoseHandoff, chatGPTPoseMessages } from './chatgpt-pose-handoff.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(long = false, effects: Record<string, unknown> = {}) {
  const dom = new JSDOM('<body></body>');
  Object.assign(globalThis, { document: dom.window.document });
  dom.window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function() { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
  let current = true;
  const events: string[] = [];
  const control = showChatGPTPoseHandoff({
    locale: 'zh-CN', handoff: { text: 'A person standing', url: 'https://chatgpt.com/', requiresPaste: long },
    pose: new Blob(['png'], { type: 'image/png' }), isCurrent: () => current,
    open: async () => { events.push('open'); }, copyImage: async () => { events.push('image'); },
    copyText: async () => { events.push('text'); }, download: () => { events.push('download'); }, ...effects,
  });
  const button = (label: string) => [...document.querySelectorAll('button')].find(item => item.textContent === label)!;
  return { control, events, button, invalidate: () => { current = false; }, dom };
}
const t = chatGPTPoseMessages['zh-CN'];
test('short prompt copies PNG before opening and leaves manual paste instructions', async () => {
  const f = fixture(); f.button(t.imageOpen).click(); await tick();
  assert.deepEqual(f.events, ['image', 'open']);
  assert.match(document.querySelector('[role=status]')!.textContent!, /粘贴/);
  assert.ok(document.querySelector('dialog')!.open); f.control.close();
});
test('long prompt requires text first then distinct PNG copy without opening again', async () => {
  const f = fixture(true); assert.equal(f.button(t.image).disabled, true);
  f.button(t.textOpen).click(); await tick(); assert.deepEqual(f.events, ['text', 'open']);
  f.button(t.image).click(); await tick(); assert.deepEqual(f.events, ['text', 'open', 'image']); f.control.close();
});
test('clipboard failure stays open and download provides a manual attach route', async () => {
  const f = fixture(false, { copyImage: async () => { throw new Error('denied'); } });
  f.button(t.imageOpen).click(); await tick(); assert.deepEqual(f.events, []);
  assert.equal(document.querySelector('[role=status]')!.textContent, t.failed);
  f.button(t.download).click(); assert.deepEqual(f.events, ['download']); assert.equal(f.button(t.open).hidden, false);
  f.button(t.open).click(); await tick(); assert.deepEqual(f.events, ['download', 'open']); f.control.close();
});
test('account or task changes during clipboard await suppress navigation', async () => {
  let finish!: () => void;
  const f = fixture(false, { copyImage: () => new Promise<void>(resolve => { finish = resolve; }) });
  f.button(t.imageOpen).click(); f.invalidate(); finish(); await tick();
  assert.deepEqual(f.events, []); assert.equal(document.querySelector('dialog'), null);
});
test('close during async operation suppresses late navigation and repeated clicks', async () => {
  let finish!: () => void; let copies = 0;
  const f = fixture(false, { copyImage: () => { copies++; return new Promise<void>(resolve => { finish = resolve; }); } });
  const action = f.button(t.imageOpen); action.click(); action.click(); f.control.close(); finish(); await tick();
  assert.equal(copies, 1); assert.deepEqual(f.events, []);
});
test('localized handoff messages keep key parity', () => {
  assert.deepEqual(Object.keys(chatGPTPoseMessages.en), Object.keys(chatGPTPoseMessages['zh-CN']));
});
