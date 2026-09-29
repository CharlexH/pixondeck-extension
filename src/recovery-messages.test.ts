import assert from "node:assert/strict";
import { test } from "node:test";
import {
  definitelyRejected,
  recoveryErrorKey,
  recoveryMessages,
} from "./recovery-messages.ts";

test("account recovery distinguishes transport, authentication and service failures", () => {
  assert.equal(
    recoveryErrorKey(new TypeError("Failed to fetch"), true),
    "localConnection",
  );
  assert.equal(
    recoveryErrorKey(new TypeError("Failed to fetch"), false),
    "connection",
  );
  assert.equal(recoveryErrorKey({ httpStatus: 401 }, true), "login");
  assert.equal(recoveryErrorKey(new Error("UNAUTHENTICATED"), true), "login");
  assert.equal(recoveryErrorKey({ httpStatus: 503 }, true), "unavailable");
});

test("only definite submission rejection releases its UUID without server resolution", () => {
  assert.equal(definitelyRejected({ httpStatus: 402 }), true);
  assert.equal(
    definitelyRejected({ httpStatus: 503, message: "reverse_unavailable" }),
    true,
  );
  assert.equal(
    definitelyRejected({ httpStatus: 503, message: "unknown" }),
    false,
  );
  assert.equal(definitelyRejected(new TypeError("Failed to fetch")), false);
});

test("recovery actions have complete English and Chinese labels", () => {
  assert.deepEqual(
    Object.keys(recoveryMessages.en),
    Object.keys(recoveryMessages["zh-CN"]),
  );
  for (const [key, text] of Object.entries(recoveryMessages["zh-CN"])) {
    assert.ok(text.trim());
    assert.notEqual(
      text,
      recoveryMessages.en[key as keyof typeof recoveryMessages.en],
    );
  }
});
