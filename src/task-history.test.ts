import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyHistory,
  mergeTask,
  normalizeHistory,
  HISTORY_LIMIT,
  deleteHistoryTask,
  LOCAL_RETENTION_MS,
  type Task,
} from "./task-history.ts";
import { recoveryDecision } from "./recovery.ts";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const task = (id: string, status = "succeeded"): Task => ({
  id,
  requestId: id,
  status,
  prompt: `result ${id}`,
  errorCode: null,
  refunded: false,
  expiresAt: 2000,
  originalWidth: 300,
  originalHeight: 200,
});
test("migrates single draft and prunes expired tasks", () => {
  const old = { task: task("old"), draft: "edited draft", hash: "hash" };
  assert.equal(normalizeHistory(old, 1000).entries[0].draft, "edited draft");
  assert.equal(normalizeHistory(old, 2000 + 6 * 86400000).entries.length, 0);
});
test("polling another task preserves selected tab and intentionally empty edited draft", () => {
  let history = mergeTask(emptyHistory(), task("old"), { now: 1000 });
  history.entries[0].draft = "";
  history.entries[0].edited = true;
  history = mergeTask(history, task("active", "running"), { now: 1000 });
  history = mergeTask(history, task("active"), { now: 1000 });
  history = mergeTask(history, task("old"), { now: 1000 });
  assert.equal(history.selectedId, "old");
  assert.equal(history.entries.find((e) => e.task.id === "old")?.draft, "");
  assert.equal(
    history.entries.find((e) => e.task.id === "active")?.draft,
    "result active",
  );
});
test("each task keeps its own thumbnail and hash; history bounded to seven days of task capacity", () => {
  let history = emptyHistory();
  for (let i = 0; i < HISTORY_LIMIT + 5; i++)
    history = mergeTask(history, task(String(i)), {
      now: 1000,
      select: true,
      hash: `h${i}`,
      thumbnail: "data:image/jpeg;base64,YQ==",
    });
  assert.equal(history.entries.length, HISTORY_LIMIT);
  assert.equal(history.selectedId, String(HISTORY_LIMIT + 4));
  assert.equal(history.entries[0].hash, `h${HISTORY_LIMIT + 4}`);
  assert.equal(history.entries[0].thumbnail, "data:image/jpeg;base64,YQ==");
});
test("rejects oversized or non-JPEG preview payloads without dropping the draft", () => {
  const history = mergeTask(emptyHistory(), task("a"), {
    now: 1000,
    thumbnail: "data:image/svg+xml;base64,YQ==",
  });
  assert.equal(history.entries[0].thumbnail, undefined);
  assert.equal(history.entries[0].draft, "result a");
});

test("deleted last task stays deleted through server refresh, persisted reopen and real cleanup", async () => {
  const now = Date.now();
  const recent = { ...task("deleted"), createdAt: new Date(now).toISOString(), expiresAt: now + 86400000 };
  let history = mergeTask(emptyHistory(), recent, { now });
  history = deleteHistoryTask(history, recent.id, now);
  history = mergeTask(history, recent, { now, select: true });
  assert.equal(history.entries.length, 0);
  assert.equal(history.selectedId, null);
  const records: Record<string, unknown> = {
    "reverse:account-a": JSON.parse(JSON.stringify(history)),
    "reverse:expired": { ...emptyHistory(), deleted: [{ id: "old", expiresAt: now - 1 }] },
  };
  const source = readFileSync(new URL("./panel.ts", import.meta.url), "utf8");
  const cleanup = source.slice(source.indexOf("async function cleanup()"), source.indexOf("async function accountChanged("));
  const context = { normalizeHistory, chrome: { storage: { local: {
    get: async () => records,
    remove: async (key: string) => { delete records[key]; },
    set: async (values: Record<string, unknown>) => { Object.assign(records, values); },
  } } }, cleanup: undefined as unknown as () => Promise<void> };
  runInNewContext(ts.transpileModule(cleanup, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  await context.cleanup();
  assert.ok(records["reverse:account-a"]);
  assert.equal(records["reverse:expired"], undefined);
  const reopened = normalizeHistory(records["reverse:account-a"], now + 1000);
  assert.equal(mergeTask(reopened, recent, { now: now + 1000 }).entries.length, 0);
  assert.equal(recoveryDecision({ recent, deletedIds: reopened.deleted.map(item => item.id), now }).task, null);
  const acknowledged = recoveryDecision({ recent, pending: { requestId: recent.requestId, hash: "h" }, deletedIds: [recent.id], now });
  assert.equal(acknowledged.task, null);
  assert.equal(acknowledged.acknowledged, true);
  assert.equal(acknowledged.unresolved, false);
});

test("deletion marks expire with local retention without hiding new tasks or another account", () => {
  const old = { ...task("a"), createdAt: new Date(1000).toISOString() };
  let history = deleteHistoryTask(mergeTask(emptyHistory(), old, { now: 1000 }), "a", 1000);
  history = mergeTask(history, task("b"), { now: 1500 });
  assert.deepEqual(history.entries.map(entry => entry.task.id), ["b"]);
  assert.equal(history.deleted.length, 1);
  assert.equal(mergeTask(emptyHistory(), old, { now: 1500 }).entries.length, 1);
  assert.deepEqual(normalizeHistory(history, 1000 + LOCAL_RETENTION_MS).deleted, []);
  assert.deepEqual(normalizeHistory({ version: 2, entries: [{task: old, draft: "legacy"}], selectedId: "a" }, 1500).deleted, []);
  assert.equal(normalizeHistory({ version: 2, entries: [{task: old, draft: "legacy"}], selectedId: "a" }, 1500).entries[0].draft, "legacy");
});
