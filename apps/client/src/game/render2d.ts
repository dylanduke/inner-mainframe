// src/game/render2d.ts
import { HIDDEN_ROWS, shapeCells, type GameState } from "@inner-mainframe/game-logic";

export function renderTetris2D(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  s: GameState,
  width: number,
  height: number,
  boardW: number,
  boardH: number
) {
  // layout: preserve board aspect (H:W = 2:1)
  const aspect = boardH / boardW;
  let cssW = width, cssH = Math.floor(width * aspect);
  if (cssH > height) { cssH = height; cssW = Math.floor(height / aspect); }

  // center inside the available offscreen
  const ox = Math.floor((width - cssW) / 2);
  const oy = Math.floor((height - cssH) / 2);

  // scale so 1 cell == cssW / boardW
  const cell = cssW / boardW;

  // clear
  ctx.save();
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, width, height);

  // playfield bg
  ctx.translate(ox, oy);
  ctx.fillStyle = "#0e1626";
  ctx.fillRect(0, 0, cssW, cssH);

  // draw a cell helper (visible area only)
  function drawCell(gx: number, gy: number) {
    const x = gx * cell;
    const y = gy * cell;
    ctx.fillStyle = "#00ff7f";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    (ctx as any).lineWidth = 1;
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
  }

  // locked cells (skip hidden rows)
  for (let y = HIDDEN_ROWS; y < s.boardH; y++) {
    for (let x = 0; x < s.boardW; x++) {
      if (s.board[y][x]) drawCell(x, y - HIDDEN_ROWS);
    }
  }

  // active piece
  const p = s.active;
  if (p) {
    const cells = shapeCells(p.type, p.rot);
    for (const [cx, cy] of cells) {
      const gx = p.x + cx;
      const gy = p.y + cy;
      if (gy >= HIDDEN_ROWS && gy < s.boardH) drawCell(gx, gy - HIDDEN_ROWS);
    }
  }

  // border
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  (ctx as any).lineWidth = 2;
  ctx.strokeRect(0, 0, cssW, cssH);

  // simple game-over curtain (kept inside offscreen so shaders see it)
  if (s.gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#fff";
    (ctx as any).font = "bold 28px ui-sans-serif, system-ui";
    (ctx as any).textAlign = "center";
    (ctx as any).textBaseline = "middle";
    (ctx as any).fillText("GAME OVER", cssW / 2, cssH / 2 - 12);
    (ctx as any).font = "16px ui-sans-serif, system-ui";
    (ctx as any).fillText("Press R to restart", cssW / 2, cssH / 2 + 16);
  }

  ctx.restore();
}
