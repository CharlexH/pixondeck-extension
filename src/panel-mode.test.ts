import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { JSDOM } from "jsdom";

const source = readFileSync(new URL("./panel.ts", import.meta.url), "utf8");
const html = readFileSync(new URL("./panel.html", import.meta.url), "utf8");

function setup(balance: number | null = null, response: () => Promise<unknown> = async () => ({ account: { balance: 12 } })) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  // The main module appends this status span while wiring the menu.
  const menuStatus = document.createElement("span"); menuStatus.id = "byokMenuStatus";
  document.getElementById("byokConfigure")!.append(menuStatus);
  const balances: number[] = [], requests: string[] = [], saved: unknown[] = [];
  let reloads = 0, dialogs = 0;
  let notifyStarted!: () => void;
  const apiStarted = new Promise<void>(resolve => { notifyStarted = resolve; });
  const context = {
    document,
    userId: "account-a", accountEpoch: 1, busy: false, uncertain: false,
    byokSettings: { mode: "byok", baseUrl: "https://provider.example/v1", model: "vision" },
    byokKey: "", byokConnection: "connected", creditBalance: balance,
    byokText: { busy: "Busy", configure: "Configure", upload: "Provider billing", credits: "Credits" },
    providerText: { connected: "已连接" }, creditUploadTitle: "1 credit",
    BYOK_SETTINGS: "pixondeck:byok-settings", BYOK_ICON_SVG: '<svg class="byok-connect-icon"></svg>',
    isByok: () => context.byokSettings.mode === "byok",
    el: (id: string) => document.getElementById(id),
    isRunning: () => false, flushFavoriteEdit: async () => true,
    chrome: { storage: { local: { set: async (data: unknown) => { saved.push(data); } } } },
    api: async (path: string) => { requests.push(path); notifyStarted(); return response(); },
    setBalance: (value: number) => {
      balances.push(value); context.creditBalance = value;
      document.getElementById("balance")!.textContent = String(value);
      document.getElementById("menuBalance")!.textContent = String(value);
    },
    status() {}, controls() {},
    location: { reload: () => { reloads++; } }, openByokDialog: () => { dialogs++; },
    renderProvider: undefined as unknown as () => void,
    saveProviderMode: undefined as unknown as (mode: "credits" | "byok") => Promise<void>,
  };
  const render = source.slice(source.indexOf("function renderProvider()"), source.indexOf("function renderFavoritesToggle()"));
  const switchMode = source.slice(source.indexOf("async function saveProviderMode("), source.indexOf("async function refreshFavorites("));
  runInNewContext(ts.transpileModule(`${render}\n${switchMode}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  context.renderProvider();
  return { context, document, balances, requests, saved, apiStarted, reloads: () => reloads, dialogs: () => dialogs, close: () => dom.window.close() };
}

test("cold BYOK-to-credits switch clears provider status before fetching the real balance", async () => {
  let resolve!: (value: unknown) => void;
  const app = setup(null, () => new Promise(done => { resolve = done; }));
  try {
    assert.equal(app.document.getElementById("balance")!.textContent, "已连接");
    const switching = app.context.saveProviderMode("credits");
    await app.apiStarted;
    assert.equal(app.document.getElementById("balance")!.textContent, "—");
    assert.equal(app.document.getElementById("menuBalance")!.textContent, "—");
    assert.equal(app.document.getElementById("balance")!.getAttribute("aria-label"), "Credits");
    assert.deepEqual(app.requests, ["/api/reverse/config"]);
    resolve({ account: { balance: 19 } });
    await switching;
    assert.deepEqual(app.balances, [19]);
    assert.equal(app.document.getElementById("balance")!.textContent, "19");
    assert.equal(app.reloads(), 0); assert.equal(app.dialogs(), 0);
  } finally { app.close(); }
});

test("known credit balance restores immediately without a config request", async () => {
  const app = setup(7);
  try {
    await app.context.saveProviderMode("credits");
    assert.equal(app.document.getElementById("balance")!.textContent, "7");
    assert.deepEqual(app.balances, [7]); assert.deepEqual(app.requests, []);
    assert.equal(app.reloads(), 0); assert.equal(app.dialogs(), 0);
  } finally { app.close(); }
});

for (const nextAccount of ["account-b", "account-a"]) {
  test(`late credit balance is ignored after account epoch changes to ${nextAccount}`, async () => {
    let resolve!: (value: unknown) => void;
    const app = setup(null, () => new Promise(done => { resolve = done; }));
    try {
      const switching = app.context.saveProviderMode("credits");
      await app.apiStarted;
      app.context.userId = nextAccount; app.context.accountEpoch++;
      resolve({ account: { balance: 999 } });
      await switching;
      assert.deepEqual(app.balances, []);
      assert.equal(app.document.getElementById("balance")!.textContent, "—");
    } finally { app.close(); }
  });
}

test("switching to unconfigured BYOK only selects the mode, without opening configuration or reloading", async () => {
  const app = setup(7);
  try {
    app.context.byokSettings.mode = "credits";
    app.context.byokSettings.model = "";
    await app.context.saveProviderMode("byok");
    assert.equal(app.context.byokSettings.mode, "byok");
    assert.equal(app.saved.length, 1);
    assert.deepEqual(app.requests, []);
    assert.equal(app.reloads(), 0); assert.equal(app.dialogs(), 0);
  } finally { app.close(); }
});
