import { test } from "node:test";
import assert from "node:assert/strict";
import { scaledDimensions } from "./image.ts";
test("960px cap preserves orientation and never upscales", () => {
  for (const [w, h, x, y] of [
    [2400, 1600, 960, 640],
    [1200, 1800, 640, 960],
    [640, 640, 640, 640],
    [300, 200, 300, 200],
    [1, 1000, 1, 960],
  ])
    assert.deepEqual(scaledDimensions(w, h), { width: x, height: y });
});
test("legacy scaling remains available for saved retry images", () => {
  assert.deepEqual(scaledDimensions(2400, 1600, 480), {
    width: 480,
    height: 320,
  });
  assert.deepEqual(scaledDimensions(300, 200, 480), {
    width: 300,
    height: 200,
  });
});
test("rejects invalid and oversized decoded images", () => {
  for (const [w, h] of [
    [0, 1],
    [1, -1],
    [Infinity, 2],
    [1.5, 2],
    [10000, 10000],
  ])
    assert.throws(() => scaledDimensions(w, h));
});
