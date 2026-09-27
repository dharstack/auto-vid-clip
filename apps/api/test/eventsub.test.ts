import assert from "node:assert/strict";
import test from "node:test";
import { verifyEventSubSignature } from "../src/eventsub.js";

test("rejects missing or stale EventSub signatures", async () => {
  const request = new Request("https://example.test/api/eventsub", { method: "POST", body: "{}" });
  assert.equal(await verifyEventSubSignature(request, "secret"), false);
});
