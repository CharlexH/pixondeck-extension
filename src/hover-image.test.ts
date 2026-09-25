import test from "node:test";
import assert from "node:assert/strict";
import { imageAtPointer } from "./hover-image.ts";

function node(tagName: string, left = 0, top = 0, width = 220, height = 300): Element {
  return {
    tagName, getAttribute: () => null, parentElement: null, firstElementChild: null, nextElementSibling: null,
    getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
  } as unknown as Element;
}
function append(parent: Element, ...children: Element[]) {
  Object.assign(parent, { firstElementChild: children[0] });
  children.forEach((child, index) => Object.assign(child, { parentElement: parent, nextElementSibling: children[index + 1] ?? null }));
}

test("direct images and link overlays resolve the same rendered image", () => {
  const card = node("DIV"), image = node("IMG"), link = node("A"), overlay = node("DIV"), save = node("BUTTON");
  append(card, image, link); append(link, overlay); append(overlay, save);
  assert.equal(imageAtPointer(image, 50, 50), image);
  assert.equal(imageAtPointer(save, 50, 50), image);
});
test("moving over one shared overlay selects the image under the pointer, not the first card", () => {
  const scope = node("DIV"), first = node("IMG"), second = node("IMG", 250), overlay = node("DIV");
  append(scope, first, second, overlay);
  assert.equal(imageAtPointer(overlay, 50, 50), first);
  assert.equal(imageAtPointer(overlay, 300, 50), second);
  assert.equal(imageAtPointer(overlay, 230, 50), null);
  assert.equal(imageAtPointer(overlay, 50, 350), null);
});
test("rendered icon dimensions and minimum area are filtered", () => {
  assert.equal(imageAtPointer(node("IMG", 0, 0, 40, 600), 20, 20), null);
  assert.equal(imageAtPointer(node("IMG", 0, 0, 120, 120), 20, 20), null);
  assert.ok(imageAtPointer(node("IMG", 0, 0, 150, 200), 20, 20));
});
test("does not search body or unbounded card descendants", () => {
  const body = node("BODY"), overlay = node("DIV"), image = node("IMG");
  append(body, overlay, image);
  assert.equal(imageAtPointer(overlay, 50, 50), null);
  const card = node("DIV"), target = node("DIV");
  append(card, target, ...Array.from({ length: 200 }, () => node("SPAN")), image);
  assert.equal(imageAtPointer(target, 50, 50), null);
});

test("a dialog overlay cannot pick an image behind the dialog", () => {
  const app = node("DIV"), image = node("IMG"), dialog = node("DIALOG"), overlay = node("DIV");
  append(app, image, dialog); append(dialog, overlay);
  assert.equal(imageAtPointer(overlay, 50, 50), null);
  Object.assign(dialog, { tagName: "DIV", getAttribute: (name: string) => name === "role" ? "dialog" : null });
  assert.equal(imageAtPointer(overlay, 50, 50), null);
});

function pinFixture(left = 0) {
  const card = node("DIV", left);
  Object.assign(card, { getAttribute: (name: string) => name === "data-test-id" ? "pin" : null });
  const image = node("IMG", left), imageWrapper = node("DIV", left), overlay = node("DIV", left);
  append(imageWrapper, image); append(card, imageWrapper, overlay);
  let nested = overlay;
  for (let i = 0; i < 12; i++) {
    const child = node("DIV", left); append(nested, child); nested = child;
  }
  const save = node("BUTTON", left), visit = node("A", left), blank = node("SPAN", left);
  append(nested, save, visit, blank);
  return { card, image, overlay, save, visit, blank };
}

test("deep Pin overlay resolves from every entry edge, action, and blank area", () => {
  const pin = pinFixture();
  for (const target of [pin.overlay, pin.save, pin.visit, pin.blank]) {
    for (const [x, y] of [[1, 150], [219, 150], [110, 1], [110, 299], [110, 150]]) {
      assert.equal(imageAtPointer(target, x, y, [target, pin.overlay, pin.image, pin.card]), pin.image);
      // Pinterest can exclude the underlying image from pointer hit-testing.
      assert.equal(imageAtPointer(target, x, y, [target, pin.overlay, pin.card]), pin.image);
    }
  }
});

test("hit-test fast path survives large card subtrees without sweeping the feed", () => {
  const pin = pinFixture();
  const noise = node("DIV"); append(noise, ...Array.from({ length: 400 }, () => node("SPAN")));
  append(pin.card, noise, pin.overlay, pin.image);
  assert.equal(imageAtPointer(pin.save, 110, 150, [pin.save, pin.image]), pin.image);
});

test("overlapping neighboring Pin and a modal behind hit stack never steal selection", () => {
  const first = pinFixture(), neighbor = pinFixture();
  const feed = node("DIV"); append(feed, first.card, neighbor.card);
  assert.equal(imageAtPointer(first.save, 110, 150, [first.save, neighbor.image, first.image]), first.image);
  const modal = node("DIALOG"), target = node("DIV"); append(modal, target); append(feed, first.card, modal);
  assert.equal(imageAtPointer(target, 110, 150, [target, first.image]), null);
});
