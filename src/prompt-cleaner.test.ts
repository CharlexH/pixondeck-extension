import { test } from "node:test";
import assert from "node:assert/strict";
import { createPromptCleaner, normalizeCleaningState, type CleaningSnapshot, type CleaningState } from "./prompt-cleaner.ts";
import { cleaningMessages } from "./cleaning-messages.ts";
function harness() {
  let selection: CleaningSnapshot | null = { account: "a", taskId: "source", text: "Original description" };
  let stored: CleaningState | null = null;
  const calls: { path: string; init?: RequestInit }[] = [];
  const notices: string[] = [];
  let confirmed = 0;
  let submissions = 0;
  let response: "success" | "lost" | "pending" | "failed" = "success";
  const make = () => createPromptCleaner({
    read: () => selection,
    load: async () => stored,
    save: async (_a, _id, value) => { stored = structuredClone(value); },
    api: async (path, init) => {
      calls.push({ path, init });
      if (!init && !path.endsWith("/child")) return { task: null };
      if (init) {
        submissions++;
        assert.equal(stored?.phase, "pending", "durable pending precedes billing request");
        if (response === "lost") throw new Error("transport lost");
      }
      return { balance: 7, task: { id: "child", requestId: "request-1", status: response === "pending" ? "running" : response === "failed" ? "failed" : "succeeded", prompt: response === "success" ? "Neutral description" : null, sourcePrompt: "Original description", refunded: response === "failed" } };
    },
    confirm: async () => { confirmed++; return true; },
    apply: async (_s, text) => { if (selection) selection.text = text; },
    changed: () => {}, notice: (message) => notices.push(message), error: () => {}, balance: () => {},
    uuid: () => "request-1", pollMs: 100000,
  });
  return { make, calls, notices, get stored() { return stored; }, get confirmed() { return confirmed; }, get submissions() { return submissions; }, get selection() { return selection; }, set selection(value) { selection = value; }, set response(value) { response = value; } };
}
test("confirmation charges once, both versions persist and subsequent toggles are free", async () => {
  const h = harness(); const cleaner = h.make();
  await cleaner.click();
  assert.equal(h.confirmed, 1); assert.equal(h.submissions, 1);
  assert.equal(h.selection?.text, "Neutral description");
  assert.equal(h.stored?.original, "Original description");
  await cleaner.click(); assert.equal(h.selection?.text, "Original description");
  await cleaner.click(); assert.equal(h.selection?.text, "Neutral description");
  assert.equal(h.confirmed, 1); assert.equal(h.submissions, 1);
  cleaner.dispose();
  const reopened = h.make(); await reopened.resume(); await reopened.click();
  assert.equal(h.selection?.text, "Original description");
  assert.equal(h.confirmed, 1); assert.equal(h.submissions, 1); reopened.dispose();
});
test("uncertain submit retains UUID and original through reopen and retries without a new confirmation", async () => {
  const h = harness(); h.response = "lost"; const cleaner = h.make();
  await cleaner.click(); assert.equal(h.stored?.phase, "pending"); cleaner.dispose();
  h.response = "success"; const reopened = h.make(); await reopened.resume();
  assert.equal(h.confirmed, 1); assert.equal(h.submissions, 2);
  const posts = h.calls.filter(call => call.init).map(call => JSON.parse(String(call.init?.body)));
  assert.deepEqual(posts[0], posts[1]); assert.equal(h.stored?.phase, "ready"); reopened.dispose();
});
test("server terminal failure preserves original and permits a newly confirmed retry", async () => {
  const h = harness(); h.response = "failed"; const cleaner = h.make();
  await cleaner.click(); assert.equal(h.stored?.phase, "failed");
  assert.equal(h.selection?.text, "Original description"); assert.ok(h.notices.includes("failed"));
  h.response = "success"; await cleaner.click(); assert.equal(h.confirmed, 2); cleaner.dispose();
});
test("running task is resumed by task ID without another debit", async () => {
  const h = harness(); h.response = "pending"; const cleaner = h.make();
  await cleaner.click(); assert.equal(h.stored?.phase, "pending");
  h.response = "success"; await cleaner.resume();
  assert.equal(h.submissions, 1); assert.equal(h.stored?.phase, "ready"); cleaner.dispose();
});
test("rejects corrupt saved ready state and keeps dictionary keys aligned", () => {
  assert.equal(normalizeCleaningState({ version: 1, original: "text", requestId: "id", phase: "ready", active: "cleaned" }), null);
  assert.deepEqual(Object.keys(cleaningMessages.en).sort(), Object.keys(cleaningMessages["zh-CN"]).sort());
  assert.match(cleaningMessages["zh-CN"].confirmBody, /1 点/);
});
test("selection change during paid request saves result without overwriting another task", async () => {
  let selection = { account: "a", taskId: "first", text: "Original" };
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const saved: { id: string; state: CleaningState }[] = [];
  const cleaner = createPromptCleaner({ read: () => selection, load: async () => null,
    save: async (_account, id, state) => { saved.push({ id, state }); },
    api: async (_path, init) => {
      if (!init) return { task: null };
      await gate; return { task: { id: "child", requestId: "request", status: "succeeded", prompt: "Cleaned" } };
    }, confirm: async () => true, apply: async () => assert.fail("must not apply to another task"),
    changed: () => {}, notice: () => {}, error: () => {}, balance: () => {}, uuid: () => "request",
  });
  const run = cleaner.click();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  selection = { account: "b", taskId: "second", text: "Second account" }; release(); await run;
  assert.equal(saved.at(-1)?.id, "first"); assert.equal(saved.at(-1)?.state.cleaned, "Cleaned");
  assert.equal(selection.text, "Second account"); cleaner.dispose();
});
test("definitive unpaid rejection releases pending and asks confirmation for retry", async () => {
  let state: CleaningState | null = null; let confirmations = 0; let ids = 0;
  const cleaner = createPromptCleaner({ read: () => ({ account: "a", taskId: "t", text: "Original" }),
    load: async () => state, save: async (_a, _t, next) => { state = next; },
    api: async (_path, init) => {
      if (!init) return { task: null };
      throw Object.assign(new Error("insufficient_credits"), { httpStatus: 402, data: { error: "insufficient_credits" } });
    }, confirm: async () => { confirmations++; return true; }, apply: async () => {}, changed: () => {},
    notice: () => assert.fail("must not claim a refund or an uncertain debit"), error: () => {}, balance: () => {}, uuid: () => `id-${++ids}`,
  });
  await cleaner.click(); assert.equal((state as CleaningState | null)?.phase, "failed");
  await cleaner.click(); assert.equal(confirmations, 2); assert.equal(ids, 2); cleaner.dispose();
});
test("editing original while request is in flight does not corrupt cleaned version on next toggle", async () => {
  let selection = { account: "a", taskId: "t", text: "Original" };
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let stored: CleaningState | null = null;
  const cleaner = createPromptCleaner({ read: () => selection, load: async () => stored,
    save: async (_a, _t, state) => { stored = state; },
    api: async (_path, init) => {
      if (!init) return { task: null };
      await gate; return { task: { id: "child", requestId: "request", status: "succeeded", prompt: "Cleaned" } };
    }, confirm: async () => true, apply: async (_s, text) => { selection.text = text; },
    changed: () => {}, notice: () => {}, error: () => {}, balance: () => {}, uuid: () => "request",
  });
  const run = cleaner.click(); for (let i = 0; i < 12; i++) await Promise.resolve();
  selection.text = "Edited original"; release(); await run;
  assert.equal(cleaner.state?.active, "original"); assert.equal(selection.text, "Edited original");
  await cleaner.click(); assert.equal(selection.text, "Cleaned");
  await cleaner.click(); assert.equal(selection.text, "Edited original"); cleaner.dispose();
});
test("cancelled confirmation never persists a charge request", async () => {
  let posts = 0, writes = 0;
  const cleaner = createPromptCleaner({ read: () => ({ account: "a", taskId: "t", text: "Original" }), load: async () => null,
    save: async () => { writes++; }, api: async (_path, init) => { if (init) posts++; return { task: null }; },
    confirm: async () => false, apply: async () => {}, changed: () => {}, notice: () => {}, error: () => {}, balance: () => {},
  });
  await Promise.all([cleaner.click(), cleaner.click()]);
  assert.equal(posts, 0); assert.equal(writes, 0); cleaner.dispose();
});
test("failure to durably store request prevents paid POST", async () => {
  let posts = 0;
  const cleaner = createPromptCleaner({ read: () => ({ account: "a", taskId: "t", text: "Original" }), load: async () => null,
    save: async () => { throw new Error("storage full"); },
    api: async (_path, init) => { if (init) posts++; return { task: null }; },
    confirm: async () => true, apply: async () => {}, changed: () => {}, notice: () => {}, error: () => {}, balance: () => {}, uuid: () => "request",
  });
  await cleaner.click(); assert.equal(posts, 0); cleaner.dispose();
});
function byokHarness(initial: CleaningState | null = null) {
  let stored = initial;
  const snapshot: CleaningSnapshot = { account: "a", taskId: "t", text: "Original", mode: "byok", configKey: "config-1" };
  let apiCalls = 0, providerCalls = 0, confirmations = 0;
  const notices: string[] = [];
  let provider: () => Promise<string> = async () => "Cleaned";
  const cleaner = createPromptCleaner({ read: () => snapshot, load: async () => stored,
    save: async (_a, _t, state) => { stored = state; },
    api: async () => { apiCalls++; return { task: { id: "child", requestId: "platform-1", status: "succeeded", prompt: "Platform cleaned" } }; },
    cleanByok: async () => { providerCalls++; assert.equal(stored?.phase, "pending"); return provider(); },
    confirm: async s => { confirmations++; assert.equal(s.mode, "byok"); return true; },
    apply: async (_s, text) => { snapshot.text = text; }, changed: () => {}, notice: message => notices.push(message),
    error: () => {}, balance: () => {}, uuid: () => "byok-request",
  });
  return { cleaner, snapshot, notices, get stored() { return stored; }, get apiCalls() { return apiCalls; },
    get providerCalls() { return providerCalls; }, get confirmations() { return confirmations; },
    set provider(value: () => Promise<string>) { provider = value; } };
}
test("BYOK uses only the provider and keeps free version toggles", async () => {
  const h = byokHarness(); await h.cleaner.resume(); assert.equal(h.apiCalls, 0);
  await h.cleaner.click(); assert.equal(h.apiCalls, 0); assert.equal(h.providerCalls, 1);
  assert.equal(h.stored?.origin, "byok"); assert.equal(h.snapshot.text, "Cleaned");
  await h.cleaner.click(); assert.equal(h.snapshot.text, "Original");
  assert.equal(h.providerCalls, 1); assert.equal(h.confirmations, 1); h.cleaner.dispose();
});
test("BYOK interrupted request is never automatically retried on reopen", async () => {
  const h = byokHarness({ version: 1, origin: "byok", original: "Original", active: "original", phase: "pending", requestId: "byok-old" });
  await h.cleaner.resume(); assert.equal(h.stored?.phase, "failed");
  assert.equal(h.apiCalls, 0); assert.equal(h.providerCalls, 0); assert.deepEqual(h.notices, ["byokFailed"]);
  await h.cleaner.click(); assert.equal(h.confirmations, 1); assert.equal(h.providerCalls, 1); h.cleaner.dispose();
});
test("switching to BYOK still recovers an existing platform debit via platform API", async () => {
  const h = byokHarness({ version: 1, origin: "credits", original: "Original", active: "original", phase: "pending", requestId: "platform-1", serverTaskId: "child" });
  await h.cleaner.resume(); assert.equal(h.apiCalls, 1); assert.equal(h.providerCalls, 0);
  assert.equal(h.confirmations, 0); assert.equal(h.stored?.origin, "credits"); h.cleaner.dispose();
});
test("BYOK failure reports possible provider billing without promising a refund", async () => {
  const h = byokHarness(); h.provider = async () => { throw new Error("network lost"); };
  await h.cleaner.click(); assert.equal(h.stored?.phase, "failed"); assert.deepEqual(h.notices, ["byokFailed"]);
  await h.cleaner.resume(); assert.equal(h.providerCalls, 1); assert.equal(h.apiCalls, 0); h.cleaner.dispose();
});
test("BYOK config changed in flight saves versions but does not replace current draft", async () => {
  const h = byokHarness(); let release!: (text: string) => void;
  h.provider = () => new Promise(resolve => { release = resolve; });
  const pending = h.cleaner.click();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  h.snapshot.configKey = "config-2"; release("Cleaned"); await pending;
  assert.equal(h.snapshot.text, "Original"); assert.equal(h.stored?.cleaned, "Cleaned");
  assert.equal(h.stored?.active, "original"); h.cleaner.dispose();
});
