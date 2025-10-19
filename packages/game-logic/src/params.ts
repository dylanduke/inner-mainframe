import type { GameParams } from "./types";

export const DEFAULT_PARAMS: GameParams = {
  gravityCellsPerSec(level) {
    // Simple curve; replace with a guideline table later
    // starts ~1.0 cps and ramps
    return 1.5 + level * 0.5;
  },
  lockDelayMs: 500,
  dasMs: 160,
  arrMs: 30, // set to 0 for instant horizontal repeat
  softDropBonus: 15,
  lineClearScore(lines) {
    return lines * 100;
  },
  levelUp(total) {
    // e.g., every 3 lines
    return Math.floor(total / 3);
  },
};
