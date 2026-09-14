import test from "node:test";
import assert from "node:assert/strict";

import { assertCompatibleServer } from "../js/storage.js";

test("current server API is accepted", () => {
  assert.doesNotThrow(() => assertCompatibleServer({ apiVersion: 3 }));
});

test("a server from before day-best-move scoring asks for restart", () => {
  assert.throws(
    () => assertCompatibleServer({ apiVersion: 2 }),
    /снова запустите start\.command/,
  );
});

test("a server started before technical-foul scoring asks for restart", () => {
  assert.throws(
    () => assertCompatibleServer({ ok: true, storage: "sqlite" }),
    /снова запустите start\.command/,
  );
});
