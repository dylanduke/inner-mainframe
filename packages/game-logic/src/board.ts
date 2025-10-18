import type { Board, GameState, Piece } from "./types";
import { SHAPES, rotateCells, normalize } from "./shapes";

type BoardCell = 0 | 1;

export function makeBoard(w: number, h: number): Board {
  const rows: Board = [];
  for (let r = 0; r < h; r++) rows.push(Array<BoardCell>(w).fill(0) as number[] as any);
  return rows;
}

export function shapeCells(type: Piece["type"], rot: number) {
  return normalize(rotateCells(SHAPES[type], rot)); // local cell coords
}

export function collides(state: GameState, p: Piece): boolean {
  const cells = shapeCells(p.type, p.rot);
  for (const [cx, cy] of cells) {
    const gx = p.x + cx, gy = p.y + cy;
    if (gx < 0 || gx >= state.boardW || gy < 0 || gy >= state.boardH) return true;
    if (gy >= 0 && state.board[gy][gx]) return true;
  }
  return false;
}

export function lockToBoard(state: GameState, p: Piece) {
  const cells = shapeCells(p.type, p.rot);
  for (const [cx, cy] of cells) {
    const gx = p.x + cx, gy = p.y + cy;
    if (gy >= 0 && gy < state.boardH && gx >= 0 && gx < state.boardW) {
      state.board[gy][gx] = 1;
    }
  }
}

// returns indices of full rows
export function fullRows(state: GameState): number[] {
  const rows: number[] = [];
  for (let y = 0; y < state.boardH; y++) {
    let full = true;
    for (let x = 0; x < state.boardW; x++) {
      if (!state.board[y][x]) { full = false; break; }
    }
    if (full) rows.push(y);
  }
  return rows;
}

export function clearRows(state: GameState, rows: number[]) {
  for (const y of rows) {
    state.board.splice(y, 1);
    state.board.unshift(Array(state.boardW).fill(0) as any);
  }
}
