import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function setup() {
  const source = readFileSync(new URL("./panel.ts", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf('el("handoff").onclick'), source.indexOf('el("retry").onclick'));
  let resolve!: (value: { token: string }) => void;
  let reject!: (reason: Error) => void;
  const response = new Promise<{ token: string }>((done, fail) => { resolve = done; reject = fail; });
  const button = { onclick: undefined as unknown as () => Promise<void> };
  const opened: string[] = [];
  const errors: string[] = [];
  const requests: Array<{path:string; body:any}> = [];
  const context = {
    favoritesView: false, flushFavoriteEdit: async () => true,
    userId: "account-a", accountEpoch: 1, task: { id: "task-a", source: "credits", originalWidth: 640, originalHeight: 854 },
    prompt: { value: "Original prompt" }, zh: true,
    config: { siteOrigin: "https://pixondeck.com" },
    el: () => button, api: (path:string, options:any) => { requests.push({path,body:JSON.parse(options.body)}); return response; },
    chrome: { tabs: { create: async ({ url }: { url: string }) => { opened.push(url); } } },
    status: (message: string) => errors.push(message),
  };
  runInNewContext(ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { context, button, opened, errors, requests, resolve, reject };
}

test("handoff opens the returned import only while the initiating account is current", async () => {
  const app = setup();
  const click = app.button.onclick();
  app.resolve({ token: "token-a" });
  await click;
  assert.deepEqual(app.opened, ["https://pixondeck.com/zh-CN/generate?import=token-a"]);
});

for (const identity of ["account-b", "", "account-a"]) {
  test(`handoff response is discarded after identity epoch changes to ${identity || "signed-out"}`, async () => {
    const app = setup();
    const click = app.button.onclick();
    // Also covers logout then login to the same account: ID alone is insufficient.
    app.context.userId = identity;
    app.context.accountEpoch++;
    app.resolve({ token: "token-a" });
    await click;
    assert.deepEqual(app.opened, []);
    assert.deepEqual(app.errors, []);
  });
}

test("handoff failure from a previous account cannot overwrite the new account status", async () => {
  const app = setup();
  const click = app.button.onclick();
  app.context.userId = "account-b";
  app.context.accountEpoch++;
  app.reject(new Error("old account request failed"));
  await click;
  assert.deepEqual(app.opened, []);
  assert.deepEqual(app.errors, []);
});

test("current account handoff failures are still reported", async () => {
  const app = setup();
  const click = app.button.onclick();
  app.reject(new Error("request failed"));
  await click;
  assert.deepEqual(app.errors, ["Error: request failed"]);
});

 test("BYOK hands off edited prompt and original dimensions without a cloud reverse task", async () => {
  const app = setup(); app.context.task.source = "byok"; app.context.prompt.value = "Edited BYOK prompt";
  const click = app.button.onclick(); app.resolve({ token: "byok-token" }); await click;
  assert.deepEqual(app.requests, []);
  const url = new URL(app.opened[0]);
  assert.equal(url.pathname, "/zh-CN/generate");
  assert.equal(url.search, "");
  assert.deepEqual(JSON.parse(decodeURIComponent(url.hash.slice(6))), {prompt: "Edited BYOK prompt", width: 640, height: 854});
});
