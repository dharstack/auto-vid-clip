import assert from "node:assert/strict";
import test from "node:test";
import { collectTables } from "../src/index.js";

test("extracts D1 table names deterministically", () => {
  assert.deepEqual(collectTables("CREATE TABLE IF NOT EXISTS vods (id TEXT);\nCREATE TABLE jobs (id TEXT);"), ["jobs", "vods"]);
});
