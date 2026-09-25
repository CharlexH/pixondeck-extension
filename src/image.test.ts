import { test } from "node:test";
import assert from "node:assert/strict";
import { scaledDimensions } from "./image.ts";
test("480px cap preserves orientation and never upscales", () => {
  for (const [w, h, x, y] of [
    [2400, 1600, 480, 320],
    [1200, 1800, 320, 480],
    [640, 640, 480, 480],
    [300, 200, 300, 200],
    [1, 1000, 1, 480],
  ])
    assert.deepEqual(scaledDimensions(w, h), { width: x, height: y });
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
