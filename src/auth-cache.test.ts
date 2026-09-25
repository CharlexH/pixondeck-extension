import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createAuthCache } from "./auth.ts";

// Exercise the installed SDK's real JWTHandler implementation, not a fake Clerk.
const sdk = readFileSync(new URL("../node_modules/@clerk/chrome-extension/dist/cjs/client/index.js", import.meta.url), "utf8");
const handlerCode = sdk.slice(sdk.indexOf("function shouldSync("), sdk.indexOf("// src/internal/utils/manifest.ts"));
function handler(store: ReturnType<typeof createAuthCache>, getCookie: () => Promise<{value: string} | null>) {
  const create = vm.runInNewContext(`${handlerCode}\nJWTHandler`, {
    STORAGE_KEY_CLIENT_JWT: "clerk_jwt", getClientCookie: getCookie,
    errorLogger: (error: unknown) => { throw error; },
  });
  return create(store, {sync: true, frontendApi: "test", name: "__client", url: "http://localhost"});
}
test("installed SDK retains response JWT when a cookie read is temporarily absent", async () => {
  let cookie: {value: string} | null = {value: "website-test-jwt"};
  const jwt = handler(createAuthCache(), async () => cookie);
  assert.equal(await jwt.get(), "website-test-jwt");
  await jwt.set("response-test-jwt"); cookie = null;
  assert.equal(await jwt.get(), "response-test-jwt");
  await jwt.remove(); assert.equal(await jwt.get(), undefined);
});
test("a rebuilt client after cookie removal cannot restore previous client's identity", async () => {
  const first = handler(createAuthCache(), async () => ({value: "old-test-jwt"}));
  assert.equal(await first.get(), "old-test-jwt");
  const rebuilt = handler(createAuthCache(), async () => null);
  assert.equal(await rebuilt.get(), undefined);
});
