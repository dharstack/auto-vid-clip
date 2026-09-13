import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG } from "../src/index.js";

test("default config follows V1 deterministic runtime rules", () => {
  assert.equal(DEFAULT_CONFIG.game, "mortal-shell-2");
  assert.equal(DEFAULT_CONFIG.maxClips, 8);
  assert.equal(DEFAULT_CONFIG.minimumScore, 0.75);
  assert.equal(DEFAULT_CONFIG.autoRenderScore, 0.9);
  assert.equal(DEFAULT_CONFIG.clip.preRollSeconds, 15);
  assert.equal(DEFAULT_CONFIG.clip.postRollSeconds, 10);
  assert.equal(DEFAULT_CONFIG.analysis.proxyHeight, 480);
  assert.equal(DEFAULT_CONFIG.analysis.fps, 15);
  assert.equal(DEFAULT_CONFIG.runtimeAI.enabled, false);
});
