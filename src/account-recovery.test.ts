import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { JSDOM } from "jsdom";
import {
  emptyHistory,
  normalizeHistory,
  mergeTask,
  type Task,
} from "./task-history.ts";
import { recoveryDecision } from "./recovery.ts";
import { canApplyRecovery } from "./recovery-guard.ts";
import { recoveryMessages, recoveryErrorKey } from "./recovery-messages.ts";

const source = readFileSync(new URL("./panel.ts", import.meta.url), "utf8");
const code =
  source.slice(
    source.indexOf("function controls()"),
    source.indexOf("function taskDetail("),
  ) +
  source.slice(
    source.indexOf("async function accountChanged("),
    source.indexOf("async function thumbnail("),
  );
const now = Date.now();
function task(
  id: string,
  status: Task["status"] = "succeeded",
  expired = false,
): Task {
  return {
    id,
    requestId: `request-${id}`,
    status,
    prompt: status === "succeeded" ? `${id} prompt` : null,
    createdAt: new Date(now - (expired ? 2 * 86400000 : 1000)).toISOString(),
    expiresAt: new Date(now + (expired ? -86400000 : 86400000)).toISOString(),
    originalWidth: 400,
    originalHeight: 200,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(
  options: {
    active?: Task;
    recent?: Task;
    stored?: Task;
    resolve?: () => Promise<unknown>;
  } = {},
) {
  const dom = new JSDOM(
    readFileSync(new URL("./panel.html", import.meta.url), "utf8"),
  );
  const document = dom.window.document;
  const pending = { requestId: "request-old", hash: "hash-old" };
  const session: Record<string, unknown> = { "request:account-a": pending };
  const calls: string[] = [],
    removed: string[] = [];
  const started = deferred<void>();
  const history = options.stored
    ? mergeTask(emptyHistory(), options.stored)
    : emptyHistory();
  // Run the real accountChanged and controls functions; side effects are injected.
  const context: any = {
    renderCleaningControls() {}, byokConfigurationRevision: 0,
    document,
    window: {
      clearTimeout() {},
      setTimeout() {
        return 1;
      },
    },
    Date,
    Error,
    userId: "account-a",
    accountEpoch: 1,
    refreshRevision: 0,
    operationRevision: 0,
    busy: false,
    recoveryChecking: false,
    uncertain: false,
    connectionIssue: "",
    pendingRequest: null,
    history,
    task: options.stored ?? null,
    prepared: null,
    requestId: "",
    hash: "",
    poll: 0,
    authRetryTimer: 0,
    authRetryCount: 0,
    startupCleanup: Promise.resolve(),
    BYOK_SETTINGS: "settings",
    BYOK_SECRET: "secret",
    DEFAULT_BYOK: { mode: "credits", baseUrl: "https://example.com/v1" },
    byokSettings: { mode: "credits" },
    byokKey: "",
    byokConnection: "unconfigured",
    prompt: document.getElementById("prompt"),
    favoritesView: false,
    RETRY_ICON_SVG: "",
    canApplyRecovery,
    recoveryDecision,
    normalizeHistory,
    mergeTask,
    recoveryText: recoveryMessages.en,
    recoveryErrorKey,
    localApi: true,
    el: (id: string) => document.getElementById(id),
    say: (en: string) => en,
    isByok: () => false,
    renderProvider() {},
    syncWelcomeDemo() {},
    refreshFavorites: async () => {},
    persist: async () => {},
    status: (message: string) => {
      document.getElementById("status")!.textContent = message;
    },
    setBalance() {},
    scheduleAuthRecovery() {},
    consumePending: async () => {},
    isRunning: () =>
      context.history.entries.some((entry: any) =>
        ["pending", "running"].includes(entry.task.status),
      ),
    renderSelected: () => {
      context.task =
        context.history.entries.find(
          (entry: any) => entry.task.id === context.history.selectedId,
        )?.task ?? null;
    },
    chrome: {
      storage: {
        local: { get: async () => ({}) },
        session: {
          get: async () => ({ ...session }),
          remove: async (key: string) => {
            removed.push(key);
            delete session[key];
          },
        },
      },
    },
    api: async (path: string) => {
      calls.push(path);
      if (path === "/api/reverse/config")
        return {
          enabled: true,
          account: { balance: 20 },
          activeTask: options.active,
          recentTask: options.recent,
        };
      assert.equal(path, "/api/reverse/requests/request-old/resolve");
      started.resolve();
      return options.resolve
        ? options.resolve()
        : { resolution: "cancelled", balance: 20 };
    },
  };
  runInNewContext(
    ts.transpileModule(code, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );
  return {
    context,
    document,
    session,
    calls,
    removed,
    started: started.promise,
    run: () =>
      context.accountChanged({ id: "account-a", email: "a@example.com" }),
    close: () => dom.window.close(),
  };
}

test("orphan request resolves without an image, clears its lock and enables a new upload", async () => {
  const app = setup();
  try {
    await app.run();
    assert.equal(app.context.uncertain, false);
    assert.equal(app.context.pendingRequest, null);
    assert.equal(app.session["request:account-a"], undefined);
    assert.equal(
      (app.document.getElementById("uploadButton") as HTMLButtonElement)
        .disabled,
      false,
    );
    assert.equal(app.context.recoveryChecking, false);
    assert.deepEqual(app.calls, [
      "/api/reverse/config",
      "/api/reverse/requests/request-old/resolve",
    ]);
  } finally {
    app.close();
  }
});

for (const expired of [false, true])
  test(`accepted ${expired ? "expired" : "older"} terminal request replaces stale running state and preserves newest history`, async () => {
    const old = task("old", "running", expired),
      newest = task("newest");
    const completed = {
      ...old,
      status: "succeeded",
      prompt: expired ? null : "restored prompt",
    };
    const app = setup({
      active: old,
      recent: newest,
      stored: old,
      resolve: async () => ({
        resolution: "accepted",
        task: completed,
        balance: 19,
      }),
    });
    try {
      await app.run();
      assert.equal(
        app.context.history.entries.find(
          (entry: any) => entry.task.id === "old",
        )?.task.status,
        "succeeded",
      );
      assert.equal(
        app.context.history.entries.find(
          (entry: any) => entry.task.id === "newest",
        )?.task.prompt,
        "newest prompt",
      );
      assert.equal(app.context.uncertain, false);
      assert.equal(app.context.isRunning(), false);
      assert.equal(
        (app.document.getElementById("uploadButton") as HTMLButtonElement)
          .disabled,
        false,
      );
    } finally {
      app.close();
    }
  });

test("failed request resolution retains its pending lock and exposes another check", async () => {
  const app = setup({
    resolve: async () => {
      throw new Error("Failed to fetch");
    },
  });
  try {
    await app.run();
    assert.equal(app.context.uncertain, true);
    assert.ok(app.session["request:account-a"]);
    assert.deepEqual(app.removed, []);
    assert.equal(app.context.recoveryChecking, false);
    const button = app.document.getElementById(
      "recoveryAction",
    ) as HTMLButtonElement;
    assert.equal(button.hidden, false);
    assert.equal(button.disabled, false);
    assert.equal(
      (app.document.getElementById("uploadButton") as HTMLButtonElement)
        .disabled,
      true,
    );
  } finally {
    app.close();
  }
});

for (const change of ["account", "operation"])
  test(`late resolution after ${change} change cannot clear pending state`, async () => {
    const reply = deferred<unknown>();
    const app = setup({ resolve: () => reply.promise });
    try {
      const run = app.run();
      await app.started;
      if (change === "account") {
        app.context.userId = "account-b";
        app.context.accountEpoch++;
      } else app.context.operationRevision++;
      reply.resolve({ resolution: "cancelled", balance: 20 });
      await run;
      assert.ok(app.session["request:account-a"]);
      assert.deepEqual(app.removed, []);
      assert.equal(app.context.uncertain, true);
    } finally {
      app.close();
    }
  });
