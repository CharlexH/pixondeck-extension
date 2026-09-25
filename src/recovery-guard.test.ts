import { test } from "node:test";
import assert from "node:assert/strict";
import { canApplyRecovery, type RecoverySnapshot } from "./recovery-guard.ts";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
test("focus config completing during image preprocessing cannot restore or auto-submit", async () => {
  let state: RecoverySnapshot = {
    refreshRevision: 1,
    operationRevision: 0,
    busy: false,
  };
  const start = { ...state };
  const server = deferred();
  let restores = 0,
    submissions = 0;
  const refresh = (async () => {
    await server.promise;
    if (!canApplyRecovery(start, state)) return;
    restores++;
    submissions++;
  })();
  state = { ...state, operationRevision: 1, busy: true };
  server.resolve();
  await refresh;
  assert.equal(restores, 0);
  assert.equal(submissions, 0);
});
test("config begun during upload is discarded even after upload finishes", async () => {
  let state: RecoverySnapshot = {
    refreshRevision: 1,
    operationRevision: 1,
    busy: true,
  };
  const start = { ...state };
  const server = deferred();
  let task = "running";
  const refresh = (async () => {
    await server.promise;
    if (canApplyRecovery(start, state)) task = "queued";
  })();
  state = { ...state, operationRevision: 2, busy: false };
  task = "succeeded";
  server.resolve();
  await refresh;
  assert.equal(task, "succeeded");
});
test("only newest idle refresh can restore; intervening task completion invalidates snapshot", () => {
  const start = { refreshRevision: 1, operationRevision: 0, busy: false };
  assert.equal(
    canApplyRecovery(start, { ...start, refreshRevision: 2 }),
    false,
  );
  assert.equal(
    canApplyRecovery(start, { ...start, operationRevision: 1 }),
    false,
  );
  assert.equal(canApplyRecovery(start, { ...start }), true);
});
