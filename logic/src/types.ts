import type { ShapeKey } from "./shapes";

export type Cell = 0 | 1;
export type Board = Cell[][]; // [row][col], 0=empty, 1=filled (color can come later)

export interface Piece {
  type: ShapeKey;
  x: number; // grid col
  y: number; // grid row
  rot: number; // 0..3
}

export const HIDDEN_ROWS = 1;

export interface Inputs {
  left?: boolean;
  right?: boolean;
  rotCW?: boolean;
  rotCCW?: boolean;
  softDrop?: boolean;
  hardDrop?: boolean;
  hold?: boolean;
  respawn?: boolean;
}

export interface GameState {
  gameOver: boolean;
  tick: number;
  boardW: number;
  boardH: number;
  board: Board;

  level: number;
  lines: number;
  score: number;

  active: Piece | null;
  hold: ShapeKey | null;
  canHold: boolean;
  next: ShapeKey[]; // queue

  // Timers
  fallAccum: number;     // fractional cells for gravity
  lockTimerMs: number;   // time piece has been grounded
  clearingRows: number[] | null; // rows being cleared (optional animation hook)

  // Input throttling
  dasLeftMs: number;
  dasRightMs: number;
  arrLeftMs: number;
  arrRightMs: number;

  // Random
  seed: number;
}

export interface GameParams {
  gravityCellsPerSec(level: number): number;
  lockDelayMs: number;
  dasMs: number;   // Delayed Auto Shift
  arrMs: number;   // Auto Repeat Rate (ms per cell; 0 == instant)
  softDropBonus: number; // extra cells/sec added while soft dropping
  lineClearScore: (lines: number, level: number) => number;
  levelUp: (totalCleared: number) => number; // derive level from total lines
}
