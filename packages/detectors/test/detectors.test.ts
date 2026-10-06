import assert from "node:assert/strict";
import test from "node:test";
import { adaptiveAudioMinimumRms, adaptiveMotionThreshold, consumeFixedChunks, detectAudioReactionEvents, detectChatClipCueEvents, detectCombatMotionEvents } from "../src/index.js";

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

test("consumes partial and multiple fixed-size stream chunks", () => {
  const frames: number[][] = [];
  consumeFixedChunks([Buffer.from([1, 2]), Buffer.from([3, 4, 5, 6, 7]), Buffer.from([8])], 3, (chunk) => frames.push([...chunk]));
  assert.deepEqual(frames, [[1, 2, 3], [4, 5, 6], [7, 8]]);
});

test("detects chat clip cue and selects prior two minutes", () => {
  const events = detectChatClipCueEvents([{ start: 130, end: 132, text: "chat, clip that" }]);
  assert.equal(events[0].type, "CHAT_CLIP_CUE");
  assert.equal(events[0].startMs, 27000);
  assert.equal(events[0].endMs, 122000);
});

test("adapts signal floors to stream levels without promoting quiet footage", () => {
  const motion = [0.028, 0.029, 0.03, 0.08, 0.13].map((difference, index) => ({ timestampMs: index * 500, difference }));
  const audio = [0.002, 0.003, 0.004, 0.026, 0.046].map((rms, index) => ({ timestampMs: index * 1000, rms }));
  assert.equal(adaptiveMotionThreshold(motion), 0.08);
  assert.equal(adaptiveAudioMinimumRms(audio), 0.02);
  assert.equal(adaptiveMotionThreshold([{ timestampMs: 0, difference: 0.1 }]), 0.25);
  assert.equal(adaptiveAudioMinimumRms([{ timestampMs: 0, rms: 0.04 }]), 0.12);
});
