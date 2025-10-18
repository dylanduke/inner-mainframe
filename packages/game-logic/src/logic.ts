import type { GameParams, GameState, Inputs, Piece } from "./types";
import { DEFAULT_PARAMS } from "./params";
import { RNG } from "./rng";
import { generateBag } from "./bag";
import { makeBoard, collides, lockToBoard, fullRows, clearRows, shapeCells } from "./board";
import type { ShapeKey } from "./shapes";

export function createGame(boardW = 10, boardH = 20, seed = 1234): GameState {
  const state: GameState = {
    tick: 0,
    boardW, boardH,
    board: makeBoard(boardW, boardH),
    level: 0,
    lines: 0,
    score: 0,
    active: null,
    hold: null,
    canHold: true,
    next: [],
    fallAccum: 0,
    lockTimerMs: 0,
    clearingRows: null,
    dasLeftMs: 0,
    dasRightMs: 0,
    arrLeftMs: 0,
    arrRightMs: 0,
    seed,
  };
  refillNext(state);
  spawnNext(state);
  return state;
}

function refillNext(state: GameState) {
  const rng = new RNG(state.seed);
  // advance RNG based on how many bags already used
  const usedBags = Math.floor(state.next.length / 7);
  for (let i = 0; i < usedBags; i++) rng.next(); // optional; or store rng in state
  // simpler: store rng in state (better):
}

export function ensureNext(state: GameState) {
  // Better: keep RNG in closure or state. Here, we store it in state by packing in seed.
  // For simplicity, append a fresh 7-bag if queue < 7.
  if (state.next.length < 7) {
    const rng = new RNG(state.seed ^= 0x9e3779b9); // mutate seed deterministically
    state.next.push(...generateBag(rng));
  }
}

export function spawnNext(state: GameState) {
  ensureNext(state);
  const type = state.next.shift() as ShapeKey;
  const piece: Piece = { type, x: 0, y: 0, rot: 0 };
  // center horizontally
  const width = pieceWidth(piece);
  piece.x = Math.floor((state.boardW - width) / 2);
  piece.y = -spawnOffsetTop(piece); // allow some negative y spawn
  state.active = piece;
  state.lockTimerMs = 0;
  state.canHold = true;
}

function pieceWidth(p: Piece) {
  let maxX = 0;
  for (const [x] of shapeCells(p.type, p.rot)) maxX = Math.max(maxX, x);
  return maxX + 1;
}
function spawnOffsetTop(p: Piece) {
  // how many rows extend above 0; simplest 0
  return 0;
}

function tryMove(state: GameState, dx: number, dy: number) {
  if (!state.active) return false;
  const n = { ...state.active, x: state.active.x + dx, y: state.active.y + dy };
  if (collides(state, n)) return false;
  state.active = n;
  return true;
}

function tryRotate(state: GameState, dir: 1 | -1) {
  if (!state.active) return;
  const rot = (((state.active.rot + dir) % 4) + 4) % 4;
  const n = { ...state.active, rot };
  if (!collides(state, n)) { state.active = n; return; }
  // minimal kicks
  const kicks: Array<[number, number]> = [[1,0],[-1,0],[0,-1],[0,1]];
  for (const [dx, dy] of kicks) {
    const k = { ...n, x: n.x + dx, y: n.y + dy };
    if (!collides(state, k)) { state.active = k; return; }
  }
}

function grounded(state: GameState): boolean {
  if (!state.active) return false;
  const n = { ...state.active, y: state.active.y + 1 };
  return collides(state, n);
}

function lockAndClear(state: GameState, params: GameParams) {
  if (!state.active) return;
  lockToBoard(state, state.active);
  state.active = null;
  const rows = fullRows(state);
  if (rows.length) {
    clearRows(state, rows);
    state.lines += rows.length;
    state.score += params.lineClearScore(rows.length, state.level);
    state.level = params.levelUp(state.lines);
  }
  spawnNext(state);
}

export function step(state: GameState, inputs: Inputs, dtMs: number, params: GameParams = DEFAULT_PARAMS) {
  state.tick++;

  // consume one-shot inputs that don’t depend on timing windows
  if (inputs.rotCW)  tryRotate(state, +1);
  if (inputs.rotCCW) tryRotate(state, -1);

  // DAS/ARR (left/right)
  handleDasArr(state, inputs, dtMs, params);

  // soft/hard drop (hard drop locks immediately)
  if (inputs.hardDrop && state.active) {
    while (!grounded(state)) tryMove(state, 0, +1);
    lockAndClear(state, params);
    return;
  }

  // Gravity
  const g = params.gravityCellsPerSec(state.level) + (inputs.softDrop ? params.softDropBonus : 0);
  state.fallAccum += (g * dtMs) / 1000;
  while (state.fallAccum >= 1 && state.active) {
    if (!tryMove(state, 0, +1)) {
      // on ground: start/advance lock delay
      state.lockTimerMs += dtMs;
      if (state.lockTimerMs >= params.lockDelayMs) {
        lockAndClear(state, params);
        state.fallAccum = 0;
        return;
      }
      break; // stay here; no more vertical moves this tick
    } else {
      // any successful move while grounded resets lock timer
      state.lockTimerMs = 0;
    }
    state.fallAccum -= 1;
  }

  // Respawn (your "R") — just spawn a new piece, ignoring current
  if (inputs.respawn) {
    spawnNext(state);
  }
}

function handleDasArr(state: GameState, inputs: Inputs, dtMs: number, params: GameParams) {
  if (!state.active) return;

  // Left
  if (inputs.left && !inputs.right) {
    if (state.dasLeftMs === 0) {
      tryMove(state, -1, 0);
      state.dasLeftMs = 1; // started
      state.arrLeftMs = 0;
    } else {
      state.dasLeftMs += dtMs;
      if (state.dasLeftMs >= params.dasMs) {
        state.arrLeftMs += dtMs;
        const stepEvery = Math.max(1, params.arrMs);
        while (state.arrLeftMs >= stepEvery) {
          if (!tryMove(state, -1, 0)) break;
          state.arrLeftMs -= stepEvery;
        }
      }
    }
    // reset opposite
    state.dasRightMs = 0; state.arrRightMs = 0;
  }
  // Right
  else if (inputs.right && !inputs.left) {
    if (state.dasRightMs === 0) {
      tryMove(state, +1, 0);
      state.dasRightMs = 1;
      state.arrRightMs = 0;
    } else {
      state.dasRightMs += dtMs;
      if (state.dasRightMs >= params.dasMs) {
        state.arrRightMs += dtMs;
        const stepEvery = Math.max(1, params.arrMs);
        while (state.arrRightMs >= stepEvery) {
          if (!tryMove(state, +1, 0)) break;
          state.arrRightMs -= stepEvery;
        }
      }
    }
    // reset opposite
    state.dasLeftMs = 0; state.arrLeftMs = 0;
  } else {
    // neither or both held: reset both
    state.dasLeftMs = 0; state.arrLeftMs = 0;
    state.dasRightMs = 0; state.arrRightMs = 0;
  }
}
