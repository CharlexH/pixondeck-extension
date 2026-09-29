import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installDialogDismissal } from './dialog-dismiss.ts';

test('all dialogs dismiss as cancel only when both press and release are on the backdrop', () => {
  const dom = new JSDOM('<body></body>');
  const doc = dom.window.document;
  const dispose = installDialogDismissal(doc);
  // Added after installation, like the image viewer and ChatGPT handoff.
  const dialog = doc.createElement('dialog'); doc.body.append(dialog); dialog.open = true;
  dialog.getBoundingClientRect = () => ({left:100,top:100,right:300,bottom:300} as DOMRect);
  let result = '';
  dialog.close = value => { result = value ?? ''; dialog.open = false; };
  const event = (type: string, x: number, y: number) => dialog.dispatchEvent(new dom.window.MouseEvent(type, {bubbles:true,clientX:x,clientY:y}));
  event('pointerdown',150,150);event('click',150,150);assert.equal(dialog.open,true);
  event('pointerdown',150,150);event('click',20,20);assert.equal(dialog.open,true);
  event('pointerdown',20,20);event('click',20,20);assert.equal(dialog.open,false);assert.equal(result,'cancel');
  dispose();dom.window.close();
});
