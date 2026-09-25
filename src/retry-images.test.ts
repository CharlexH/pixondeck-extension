import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeRetryImageRecord,
  shouldPruneRetryImage,
  RETRY_IMAGE_RETENTION_MS,
  type RetryImage,
} from "./retry-images.ts";
const image = (): RetryImage => ({
  blob: new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }),
  originalWidth: 2400,
  originalHeight: 1600,
  width: 480,
  height: 320,
  artificialBackground: false,
  animated: false,
});
test("retains the prepared Blob and original geometry without base64 or re-encoding", () => {
  const input = image();
  const record = makeRetryImageRecord("user-a", "task", input, 10_000, 1000);
  assert.equal(record.image.blob, input.blob);
  assert.deepEqual(record.image, input);
  assert.equal(record.expiresAt, 10_000);
});
test("retention respects earlier expiry and caps accidental later expiry at seven days", () => {
  const early = makeRetryImageRecord(
    "a",
    "t",
    image(),
    new Date(5000).toISOString(),
    1000,
  );
  assert.equal(early.expiresAt, 5000);
  assert.equal(
    makeRetryImageRecord("a", "t", image(), 1e15, 1000).expiresAt,
    1000 + RETRY_IMAGE_RETENTION_MS,
  );
  assert.throws(
    () => makeRetryImageRecord("a", "t", image(), 1000, 1000),
    /EXPIRED/,
  );
  assert.throws(
    () => makeRetryImageRecord("a", "t", image(), "invalid", 1000),
    /EXPIRED/,
  );
});
test("rejects accidentally persisting original-size or oversized uploads", () => {
  assert.throws(
    () =>
      makeRetryImageRecord(
        "a",
        "t",
        { ...image(), width: 2400, height: 1600 },
        5000,
        1000,
      ),
    /INVALID_PREPARED/,
  );
  assert.throws(
    () =>
      makeRetryImageRecord(
        "a",
        "t",
        {
          ...image(),
          blob: new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], {
            type: "image/jpeg",
          }),
        },
        5000,
        1000,
      ),
    /INVALID_PREPARED/,
  );
  assert.throws(
    () => makeRetryImageRecord("", "t", image(), 5000, 1000),
    /IDENTITY/,
  );
});
test("pruning expires all accounts but never evicts another account's live images", () => {
  const a = makeRetryImageRecord("a", "same-task", image(), 5000, 1000);
  const b = makeRetryImageRecord("b", "same-task", image(), 5000, 1000);
  assert.equal(shouldPruneRetryImage(a, 2000, "a", new Set()), true);
  assert.equal(shouldPruneRetryImage(b, 2000, "a", new Set()), false);
  assert.equal(
    shouldPruneRetryImage(a, 2000, "a", new Set(["same-task"])),
    false,
  );
  assert.equal(
    shouldPruneRetryImage(b, 5000, "a", new Set(["same-task"])),
    true,
  );
  assert.equal(shouldPruneRetryImage(a, 2000), false);
});

test("retains an optional original separately from the 480px upload with the same expiry", () => {
  const originalBlob = new Blob(["original source bytes"], { type: "image/webp" });
  const input = { ...image(), originalBlob };
  const record = makeRetryImageRecord("a", "t", input, 5000, 1000);
  assert.equal(record.image.originalBlob, originalBlob);
  assert.equal(record.image.blob, input.blob);
  assert.notEqual(record.image.blob, originalBlob);
  assert.equal(shouldPruneRetryImage(record, 5000), true);
  assert.equal(shouldPruneRetryImage(record, 2000, "a", new Set()), true);
});
test("rejects unsupported or oversized originals while accepting legacy prepared-only images", () => {
  for (const originalBlob of [
    new Blob(["svg"], { type: "image/svg+xml" }),
    new Blob([new Uint8Array(20 * 1024 * 1024 + 1)], { type: "image/jpeg" }),
  ]) {
    assert.throws(() => makeRetryImageRecord("a", "t", { ...image(), originalBlob }, 5000, 1000), /INVALID_ORIGINAL/);
  }
  assert.equal(makeRetryImageRecord("a", "t", image(), 5000, 1000).image.originalBlob, undefined);
});
