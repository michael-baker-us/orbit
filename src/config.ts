/** Distances use a 640 × 640 logical board; speeds are radians/second. */
export const CONFIG = {
  rings: [
    { radius: 116, speed: 0.36, capacity: 6 },
    { radius: 188, speed: 0.25, capacity: 8 },
    { radius: 260, speed: 0.17, capacity: 10 },
  ],
  objectRadius: 22,
  planetRadius: 46,
  fixedStep: 1 / 120,
  launchCooldown: 0.38,
  flightDuration: 0.3,
  boostSpeed: 1.25,
  boostDuration: 2.5,
  comboWindow: 3,
  comboStep: 1,
  maxMultiplier: 5,
  mergeAnimationDuration: 0.55,
  scoreBase: 10,
  capacityGrace: 1.8,
  upcomingCount: 2,
  reserveEnabled: true,
  forecast: { horizon: 6, refreshInterval: 0.09 },
  spawnDistribution: [{ value: 1, weight: 0.72 }, { value: 2, weight: 0.24 }, { value: 3, weight: 0.04 }],
  difficulty: { everyMerges: 12, extraTwoWeight: 0.025, maxExtraTwoWeight: 0.15 },
  startingObjects: [
    { ring: 0, value: 1, angle: -1.2 }, { ring: 0, value: 2, angle: 1.7 },
    { ring: 1, value: 1, angle: -0.6 }, { ring: 1, value: 2, angle: 2.5 },
    { ring: 1, value: 3, angle: 4.6 },
    { ring: 2, value: 1, angle: 0.65 }, { ring: 2, value: 2, angle: 3.8 },
  ],
};
export type GameConfig = typeof CONFIG;
export const PALETTE = ['#91ead7', '#a9b5ff', '#f3c48b', '#f19ebf', '#a9db91', '#8bd4f0'];
export const colorFor = (value: number) => PALETTE[(value - 1) % PALETTE.length];
