import type { AutoClipperConfig } from "./index.js";

export interface ClipRecipe {
  id: string;
  name: string;
  config: AutoClipperConfig;
}

export const GENERIC_RECIPE: ClipRecipe = {
  id: "generic",
  name: "Generic highlights",
  config: {
    game: "mortal-shell-2",
    maxClips: 8,
    minimumScore: 0.75,
    autoRenderScore: 0.9,
    clip: { preRollSeconds: 15, postRollSeconds: 10 },
    analysis: { proxyHeight: 480, fps: 15 },
    detect: { boss: true, lowHealth: true, death: true, combatSpike: true, criticalAttack: true, execution: true, microphoneReaction: true },
    runtimeAI: { enabled: true }
  }
};

export function getRecipe(id?: string): ClipRecipe {
  if (!id || id === GENERIC_RECIPE.id) return GENERIC_RECIPE;
  throw new Error(`RECIPE_NOT_FOUND: ${id}`);
}
