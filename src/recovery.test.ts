import { test } from "node:test";
import assert from "node:assert/strict";
import { recoveryDecision, isExpired } from "./recovery.ts";
const task = (id: string, expiry = 2000) => ({
  id,
  requestId: `request-${id}`,
  expiresAt: new Date(expiry).toISOString(),
});
test("accepted response lost and completed restores matching recent instead of old local task", () => {
  const next = task("new");
  assert.deepEqual(
    recoveryDecision({
      recent: next,
      stored: task("old"),
      pending: { requestId: next.requestId, hash: "new-image" },
      now: 1000,
    }),
    { task: next, unresolved: false, acknowledged: true },
  );
});
test("unknown submission remains unresolved and cannot authorize a new UUID", () => {
  const old = task("old");
  assert.deepEqual(
    recoveryDecision({
      recent: old,
      stored: old,
      pending: { requestId: "unknown", hash: "image" },
      now: 1000,
    }),
    { task: old, unresolved: true, acknowledged: false },
  );
});
test("current active task takes priority; matching active acknowledges pending", () => {
  const active = task("active");
  assert.deepEqual(
    recoveryDecision({
      active,
      recent: task("old"),
      pending: { requestId: active.requestId, hash: "image" },
      now: 1000,
    }),
    { task: active, unresolved: false, acknowledged: true },
  );
});
test("expired results cannot restore their local draft", () => {
  const expired = task("old", 1000);
  assert.equal(isExpired(expired, 1000), true);
  assert.deepEqual(
    recoveryDecision({ recent: expired, stored: expired, now: 1000 }),
    { task: null, unresolved: false, acknowledged: false },
  );
});

test("authoritative resolution releases an expired request without restoring expired content", () => {
  const old = task("old", 1000);
  assert.deepEqual(
    recoveryDecision({
      pending: { requestId: old.requestId, hash: "old-image" },
      resolvedRequest: { requestId: old.requestId, task: old },
      now: 2000,
    }),
    { task: null, unresolved: false, acknowledged: true },
  );
});

test("server cancellation releases an orphan pending request, but a different request cannot", () => {
  const pending = { requestId: "orphan", hash: "image" };
  assert.equal(
    recoveryDecision({
      pending,
      resolvedRequest: { requestId: "orphan", task: null },
    }).unresolved,
    false,
  );
  assert.equal(
    recoveryDecision({
      pending,
      resolvedRequest: { requestId: "other", task: null },
    }).unresolved,
    true,
  );
  assert.equal(recoveryDecision({ pending }).unresolved, true);
});

test("recovery of an older request does not hide a different active task", () => {
  const active = task("active", 5000),
    old = task("old");
  assert.deepEqual(
    recoveryDecision({
      active,
      pending: { requestId: old.requestId, hash: "image" },
      resolvedRequest: { requestId: old.requestId, task: old },
      now: 1000,
    }),
    { task: active, unresolved: false, acknowledged: true },
  );
});

test("an active task must keep being tracked even after its content expiry", () => {
  const active = task("active", 1000);
  assert.equal(recoveryDecision({ active, now: 2000 }).task, active);
});
