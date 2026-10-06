import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONFIG, GENERIC_RECIPE, getRecipe } from "../src/index.js";

test("default config enables OpenCode clip selection", () => {
  assert.equal(DEFAULT_CONFIG.game, "mortal-shell-2");
  assert.equal(DEFAULT_CONFIG.maxClips, 8);
  assert.equal(DEFAULT_CONFIG.minimumScore, 0.75);
  assert.equal(DEFAULT_CONFIG.autoRenderScore, 0.9);
  assert.equal(DEFAULT_CONFIG.clip.preRollSeconds, 15);
  assert.equal(DEFAULT_CONFIG.clip.postRollSeconds, 10);
  assert.equal(DEFAULT_CONFIG.analysis.proxyHeight, 480);
  assert.equal(DEFAULT_CONFIG.analysis.fps, 15);
  assert.equal(DEFAULT_CONFIG.runtimeAI.enabled, true);
});

test("generic recipe uses OpenCode selection", () => {
  assert.equal(getRecipe().id, "generic");
  assert.equal(getRecipe("generic"), GENERIC_RECIPE);
  assert.equal(GENERIC_RECIPE.config.runtimeAI.enabled, true);
  assert.throws(() => getRecipe("missing"), /RECIPE_NOT_FOUND/);
});
