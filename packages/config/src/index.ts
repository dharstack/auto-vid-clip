export interface ClipConfig {
  preRollSeconds: number;
  postRollSeconds: number;
}

export interface AnalysisConfig {
  proxyHeight: number;
  fps: number;
}

export interface DetectorConfig {
  boss: boolean;
  lowHealth: boolean;
  death: boolean;
  combatSpike: boolean;
  criticalAttack: boolean;
  execution: boolean;
  microphoneReaction: boolean;
}

export interface RuntimeAiConfig {
  enabled: boolean;
}

export interface AutoClipperConfig {
  game: "mortal-shell-2";
  maxClips: number;
  minimumScore: number;
  autoRenderScore: number;
  clip: ClipConfig;
  analysis: AnalysisConfig;
  detect: DetectorConfig;
  runtimeAI: RuntimeAiConfig;
}

export const DEFAULT_CONFIG: AutoClipperConfig = {
  game: "mortal-shell-2",
  maxClips: 8,
  minimumScore: 0.75,
  autoRenderScore: 0.9,
  clip: {
    preRollSeconds: 15,
    postRollSeconds: 10
  },
  analysis: {
    proxyHeight: 480,
    fps: 15
  },
  detect: {
    boss: true,
    lowHealth: true,
    death: true,
    combatSpike: true,
    criticalAttack: true,
    execution: true,
    microphoneReaction: true
  },
  runtimeAI: {
    enabled: false
  }
};
