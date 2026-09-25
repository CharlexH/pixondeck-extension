import test from "node:test";
import assert from "node:assert/strict";
import { createAuthSync, isAuthCookie } from "./auth.ts";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function fixture() {
  let name: string | null = null;
  let calls = 0;
  let stopped = 0;
  let cookieListener: ((change: any) => void) | undefined;
  const changes: (string | null)[] = [];
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const sync = createAuthSync({publishableKey: "test", syncHost: "http://localhost", onChange: (u) => { changes.push(u?.id ?? null); }, onError: (e) => { throw e; }}, {
    cookies: {addListener: (cb) => { cookieListener = cb; }, removeListener: () => { cookieListener = undefined; }},
    window: win, document: doc,
    createClient: async () => {
      calls++;
      const id = name;
      return {signOut: async () => { name = null; }, user: id ? {id} : null, session: {getToken: async () => id}, addListener: (cb) => { cb(); return () => { stopped++; }; }};
    },
  });
  return {sync, win, doc, changes, set: (id: string | null) => { name = id; }, calls: () => calls, stopped: () => stopped,
    cookie: (cookie = {name: "__client_uat", domain: "localhost", value: "1"}) => cookieListener?.({cookie, removed: false})};
}
test("login, account switch and logout synchronize without manual refresh", async () => {
  const f = fixture(); await f.sync.start();
  f.set("a"); f.cookie(); await tick();
  assert.equal(f.sync.getUser()?.id, "a"); assert.equal(await f.sync.getToken(), "a");
  f.set("b"); f.cookie(); assert.equal(await f.sync.getToken(), null); await tick();
  assert.equal(f.sync.getUser()?.id, "b");
  f.set(null); f.cookie(); await tick();
  assert.equal(await f.sync.getToken(), null);
  assert.deepEqual(f.changes, [null, "a", "b", null]);
  f.sync.dispose();
});
test("focus/visibility recover missed events, disposal releases listeners", async () => {
  const f = fixture(); await f.sync.start();
  f.set("a"); f.win.dispatchEvent(new Event("focus")); await tick();
  f.set("b"); f.doc.dispatchEvent(new Event("visibilitychange")); await tick();
  assert.equal(f.sync.getUser()?.id, "b");
  f.sync.dispose(); const calls = f.calls();
  f.cookie(); f.win.dispatchEvent(new Event("focus"));
  await tick(); assert.equal(f.calls(), calls); assert.equal(f.stopped(), 3);
});
test("unrelated host/session refresh cookies do not trigger requests", async () => {
  const f = fixture(); await f.sync.start();
  f.cookie({name: "__session", domain: "localhost", value: "secret"});
  f.cookie({name: "__client_uat", domain: "evil.localhost", value: "1"});
  await tick(); assert.equal(f.calls(), 1); f.sync.dispose();
  assert.equal(isAuthCookie({cookie: {name: "__client", domain: ".example.com", value: ""}, removed: true}, "https://clerk.example.com"), true);
});
test("cookie changes during initialization discard stale identity", async () => {
  const f = fixture(); f.set("a");
  const start = f.sync.start(); f.set("b"); f.cookie();
  await start;
  assert.deepEqual(f.changes, ["b"]); assert.equal(await f.sync.getToken(), "b");
  f.sync.dispose();
});
test("file-picker focus refresh waits for the same account before authorizing upload", async () => {
  const f = fixture(); f.set("a"); await f.sync.start();
  f.win.dispatchEvent(new Event("focus"));
  assert.equal(await f.sync.getToken(), "a");
  f.sync.dispose();
});
test("focus arriving DURING token retrieval retries the same identity", async () => {
  const win = new EventTarget();
  let release!: (value: string) => void;
  let calls = 0;
  const sync = createAuthSync({publishableKey: "test", syncHost: "http://localhost", onChange: () => {}, onError: (e) => { throw e; }}, {
    cookies: {addListener: () => {}, removeListener: () => {}}, window: win,
    document: Object.assign(new EventTarget(), {visibilityState: "visible"}),
    createClient: async () => {
      const first = ++calls === 1;
      return {signOut: async () => {}, user: {id: "same"}, session: {getToken: () => first ? new Promise<string>((resolve) => { release = resolve; }) : Promise.resolve("fresh")}, addListener: () => () => {}};
    },
  });
  await sync.start(); const token = sync.getToken();
  win.dispatchEvent(new Event("focus")); await tick(); release("old");
  assert.equal(await token, "fresh"); sync.dispose();
});
test("explicit logout revokes the session and focus cannot restore it", async () => {
  const f = fixture(); f.set("a"); await f.sync.start();
  await f.sync.signOut();
  assert.equal(f.sync.getUser(), null);
  f.win.dispatchEvent(new Event("focus")); await tick();
  assert.equal(await f.sync.getToken(), null);
  f.sync.dispose();
});
test("logout discards pending refresh, blocks tokens and coalesces repeated clicks", async () => {
  const win = new EventTarget();
  const changes: (string | null)[] = [];
  let calls = 0;
  let revoked = false;
  let signOutCalls = 0;
  let releaseRefresh!: () => void;
  let releaseLogout!: () => void;
  const sync = createAuthSync({publishableKey: "test", syncHost: "http://localhost", onChange: (u) => { changes.push(u?.id ?? null); }, onError: (e) => { throw e; }}, {
    cookies: {addListener: () => {}, removeListener: () => {}}, window: win,
    document: Object.assign(new EventTarget(), {visibilityState: "visible"}),
    createClient: async () => {
      const current = ++calls;
      if (current === 2) await new Promise<void>((resolve) => { releaseRefresh = resolve; });
      return {user: revoked ? null : {id: "a"}, session: {getToken: async () => "token"}, addListener: () => () => {},
        signOut: async () => { signOutCalls++; await new Promise<void>((resolve) => { releaseLogout = resolve; }); revoked = true; }};
    },
  });
  await sync.start();
  const refresh = sync.refresh();
  const logout = sync.signOut();
  assert.equal(sync.signOut(), logout);
  assert.equal(await sync.getToken(), null);
  releaseRefresh(); await refresh; await tick();
  win.dispatchEvent(new Event("focus")); await tick();
  assert.equal(calls, 2);
  assert.deepEqual(changes, ["a"]);
  releaseLogout(); await logout;
  assert.equal(signOutCalls, 1);
  assert.equal(await sync.getToken(), null);
  assert.ok(changes.slice(1).every((id) => id === null));
  sync.dispose();
});
test("failed revocation reports failure without pretending the session was logged out", async () => {
  const changes: (string | null)[] = [];
  const sync = createAuthSync({publishableKey: "test", syncHost: "http://localhost", onChange: (u) => { changes.push(u?.id ?? null); }, onError: () => {}}, {
    cookies: {addListener: () => {}, removeListener: () => {}}, window: new EventTarget(),
    document: Object.assign(new EventTarget(), {visibilityState: "visible"}),
    createClient: async () => ({user: {id: "a"}, session: {getToken: async () => "token"}, addListener: () => () => {},
      signOut: async () => { throw new Error("offline"); }}),
  });
  await sync.start();
  await assert.rejects(sync.signOut(), /offline/);
  assert.equal(sync.getUser()?.id, "a");
  assert.equal(await sync.getToken(), "token");
  assert.ok(changes.every((id) => id === "a"));
  sync.dispose();
});
