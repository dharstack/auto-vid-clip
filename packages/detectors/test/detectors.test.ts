import assert from "node:assert/strict";
import test from "node:test";
import { detectEventsFromProbe } from "../src/index.js";

test("creates deterministic starter events from media probe", () => {
  const events = detectEventsFromProbe({ durationMs: 120000, width: 1920, height: 1080, fps: 60, hasAudio: true });
  assert.equal(events[0].type, "BOSS_PRESENT");
  assert.equal(events.at(-1)?.type, "MIC_REACTION");
});
