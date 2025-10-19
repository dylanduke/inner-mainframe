import { HIDDEN_ROWS, shapeCells, type GameState } from "@inner-mainframe/game-logic";

export function makeGameRenderer(
  gameRef: React.MutableRefObject<GameState>,
  BOARD_W: number,
  BOARD_H: number,
  runningRef: {  current: boolean }
) {
  const APPLE_FONT = "Apple II, ui-sans-serif, system-ui";

  // --- HUD state: always drawn, values only update on line-clear ---
  let lastLines = -1;
  let displayScore = 0;
  let displayLevel = 0;
  let displayLines = 0;

  return function renderGameToOffscreen(
    offscreen: OffscreenCanvas,
    ctx: OffscreenCanvasRenderingContext2D,
    webglCanvas: HTMLCanvasElement
  ) {
    const DPR = Math.min(2, self.devicePixelRatio || 1);
    if (offscreen.width !== webglCanvas.width || offscreen.height !== webglCanvas.height) {
      offscreen.width = webglCanvas.width;
      offscreen.height = webglCanvas.height;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // Full-frame pre-CRT background
    ctx.fillStyle = "#0a0f1a";
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);

    // Centered board rectangle (same sizing as before)
    const MARGIN = 24;
    const SCALE = 0.85;
    const vw = offscreen.width / DPR;
    const vh = offscreen.height / DPR;
    const aspect = BOARD_H / BOARD_W;

    const maxByW = Math.max(0, vw - MARGIN * 2);
    const maxByH = Math.max(0, (vh - MARGIN * 2) / aspect);
    const cssW = Math.floor(Math.min(maxByW, maxByH) * SCALE);
    const cssH = Math.floor(cssW * aspect);

    const pxW = Math.floor(cssW * DPR);
    const pxH = Math.floor(cssH * DPR);
    const pxX = Math.floor((offscreen.width  - pxW) / 2);
    const pxY = Math.floor((offscreen.height - pxH) / 2);

    // Playfield bg
    ctx.fillStyle = "#0e1626";
    ctx.fillRect(pxX, pxY, pxW, pxH);

    // Draw board
    const s = gameRef.current;
    const cell = pxW / BOARD_W;

    function drawCell(gx: number, gy: number) {
      const x = pxX + Math.floor(gx * cell);
      const y = pxY + Math.floor(gy * cell);
      ctx.fillStyle = "#00ff7f";
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = Math.max(1, Math.floor(DPR));
      ctx.fillRect(x, y, Math.ceil(cell), Math.ceil(cell));
      ctx.strokeRect(x + 0.5, y + 0.5, Math.ceil(cell) - 1, Math.ceil(cell) - 1);
    }

    for (let y = HIDDEN_ROWS; y < s.boardH; y++) {
      for (let x = 0; x < s.boardW; x++) {
        if (s.board[y][x]) drawCell(x, y - HIDDEN_ROWS);
      }
    }

    const p = s.active;
    if (p) {
      for (const [cx, cy] of shapeCells(p.type, p.rot)) {
        const gx = p.x + cx;
        const gy = p.y + cy;
        if (gy >= HIDDEN_ROWS && gy < s.boardH) drawCell(gx, gy - HIDDEN_ROWS);
      }
    }

    // Green border
    ctx.strokeStyle = "#00ff7f";
    ctx.lineWidth = Math.max(2, Math.round(2 * DPR));
    ctx.strokeRect(pxX + 0.5, pxY + 0.5, pxW - 1, pxH - 1);

    // ---- Update HUD values ONLY when lines change ----
    if (s.lines !== lastLines) {
      lastLines = s.lines;
      displayScore = s.score;
      displayLevel = s.level;
      displayLines = s.lines;
    }

    // ---- Draw HUD (always visible; values only change on line-clear) ----
    const minDim = Math.min(offscreen.width, offscreen.height);
    const hudTitlePx = Math.max(14, Math.round(minDim * 0.018));
    const hudGapPx   = Math.max(6, Math.round(hudTitlePx * 0.4));

    const hudX = Math.round(offscreen.width / 2);
    const hudY = Math.round(pxY - hudGapPx * 1.2);

    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#00ff7f";
    ctx.font = `bold ${hudTitlePx}px ${APPLE_FONT}`;
    ctx.shadowColor = "rgba(0,255,127,0.25)";
    ctx.shadowBlur = Math.ceil(2 * DPR);

    const hudText = `Score: ${displayScore.toLocaleString()} • Level: ${displayLevel} • Lines: ${displayLines}`;
    ctx.fillText(hudText, hudX, hudY);

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.35;
    const w = ctx.measureText(hudText).width;
    ctx.fillRect(hudX - Math.ceil(w / 2), hudY + Math.ceil(DPR), Math.ceil(w), Math.ceil(DPR));
    ctx.globalAlpha = 1;

    // ---- Full-screen GAME OVER overlay ----
    if (s.gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);

      const titleSize = Math.max(24, Math.round(minDim * 0.08));
      const subSize   = Math.max(12, Math.round(minDim * 0.035));

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,255,127,0.5)";
      ctx.shadowBlur = Math.ceil(6 * DPR);

      ctx.fillStyle = "#00ff7f";
      ctx.font = `900 ${titleSize}px ${APPLE_FONT}`;
      ctx.fillText("GAME OVER", offscreen.width / 2, offscreen.height / 2 - titleSize * 0.35);

      ctx.shadowBlur = Math.ceil(3 * DPR);
      ctx.font = `${subSize}px ${APPLE_FONT}`;
      ctx.fillText("Press R to restart", offscreen.width / 2, offscreen.height / 2 + subSize * 1.2);
    }
    if (!s.gameOver && !runningRef.current) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      
        const titleSize = Math.max(24, Math.round(minDim * 0.06));
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0,255,127,0.4)";
        ctx.shadowBlur = Math.ceil(4 * DPR);
      
        ctx.fillStyle = "#00ff7f";
        ctx.font = `900 ${titleSize}px ${APPLE_FONT}`;
        ctx.fillText("PAUSED", offscreen.width / 2, offscreen.height / 2);
      }
  };
}
