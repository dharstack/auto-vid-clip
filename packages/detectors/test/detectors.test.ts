import assert from "node:assert/strict";
import test from "node:test";
import { detectAudioReactionEvents, detectCombatMotionEvents } from "../src/index.js";

test("detects sustained motion spikes from sampled frame differences", () => {
  const events = detectCombatMotionEvents([
    { timestampMs: 0, difference: 0.02 },
    { timestampMs: 1000, difference: 0.03 },
    { timestampMs: 2000, difference: 0.42 },
    { timestampMs: 3000, difference: 0.48 },
    { timestampMs: 4000, difference: 0.44 },
    { timestampMs: 5000, difference: 0.03 }
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "COMBAT_SPIKE");
  assert.equal(events[0].startMs, 2000);
  assert.equal(events[0].endMs, 5000);
  assert.ok(events[0].confidence > 0.4);
});

test("detects audio reaction outliers against rolling baseline", () => {
  const events = detectAudioReactionEvents([
    { timestampMs: 0, rms: 0.04 },
    { timestampMs: 1000, rms: 0.05 },
    { timestampMs: 2000, rms: 0.06 },
    { timestampMs: 3000, rms: 0.42 },
    { timestampMs: 4000, rms: 0.44 }
  ], { baselineWindow: 3, multiplier: 3, minimumRms: 0.2 });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "MIC_REACTION");
  assert.equal(events[0].startMs, 3000);
});
