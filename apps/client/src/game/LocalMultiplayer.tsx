// src/game/LocalMultiplayer.tsx
import React, { useEffect, useRef } from "react";
import {
  createGame, step, DEFAULT_PARAMS,
  type GameState, type Inputs, HIDDEN_ROWS, shapeCells
} from "@inner-mainframe/game-logic";
import { createOffscreenCanvas, drawWithShaders, setupWebglCanvas, Color } from "@hackvegas-2025/shared";
import appleFontUrl from "./apple-ii.ttf?url";

const BOARD_W = 10;
const BOARD_H = 20;
const FIXED_DT = 1 / 60;

export default function LocalMultiplayer(): JSX.Element {
  const runningRef = useRef(true);
  const rafGameRef = useRef(0);
  const rafShaderRef = useRef(0);
  const tPrevRef = useRef(0);
  const accRef = useRef(0);

  // games + inputs
  const p1Ref = useRef<GameState>(createGame(BOARD_W, BOARD_H, 0x0a11ce)); // left
  const p2Ref = useRef<GameState>(createGame(BOARD_W, BOARD_H, 0xb0b00));  // right
  const p1InRef = useRef<Inputs>({});
  const p2InRef = useRef<Inputs>({});

  // webgl/shader
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
  const shaderDataRef = useRef<any>(null);
  const offscreenRef = useRef<OffscreenCanvas | null>(null);
  const offctxRef = useRef<OffscreenCanvasRenderingContext2D | null>(null);

  useEffect(() => {
    // Load font
    try {
      const ff = new FontFace("Apple II", `url(${appleFontUrl})`, { style: "normal", weight: "400", display: "swap" });
      ff.load().then((f) => (document as any).fonts.add(f));
    } catch {}

    // Offscreen + WebGL
    const { offscreenCanvas, offscreenCtx } = createOffscreenCanvas();
    offscreenRef.current = offscreenCanvas;
    offctxRef.current = offscreenCtx;

    const { canvas, gl, shaderData } = setupWebglCanvas(offscreenCanvas, offscreenCtx);
    webglCanvasRef.current = canvas;
    glRef.current = gl;
    shaderDataRef.current = shaderData;

    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "0",
      display: "block",
    });
    document.body.appendChild(canvas);

    // renderer (dual boards)
    const renderDual = makeDualRenderer(p1Ref, p2Ref, BOARD_W, BOARD_H, runningRef);

    // shader RAF
    function drawShaders() {
      const gl = glRef.current as any;
      const c = webglCanvasRef.current!;
      const data = shaderDataRef.current!;
      drawWithShaders(gl, c, data, renderDual, Color.green, 24);
      rafShaderRef.current = requestAnimationFrame(drawShaders);
    }
    rafShaderRef.current = requestAnimationFrame(drawShaders);

    // game loop
    function tickOne(gs: GameState, ins: Inputs, dt: number) {
      step(gs, ins, dt * 1000, DEFAULT_PARAMS);
      // clear one-shots
      ins.rotCW = ins.rotCCW = ins.hardDrop = ins.respawn = false;
    }
    function loop() {
      if (!runningRef.current) return;
      const now = performance.now();
      let dt = (now - tPrevRef.current) / 1000;
      tPrevRef.current = now;

      accRef.current += dt;
      while (accRef.current >= FIXED_DT) {
        tickOne(p1Ref.current, p1InRef.current, FIXED_DT);
        tickOne(p2Ref.current, p2InRef.current, FIXED_DT);
        accRef.current -= FIXED_DT;
      }
      rafGameRef.current = requestAnimationFrame(loop);
    }
    tPrevRef.current = performance.now();
    accRef.current = 0;
    rafGameRef.current = requestAnimationFrame(loop);

    // --- keyboard controls (split by player, mirroring single-player semantics) ---
    function onKey(e: KeyboardEvent, down: boolean) {
      const k = e.key;

      // prevent browser scroll/focus behavior that can swallow movement keys
      const handled = new Set([
        "ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " ",
        "a","A","d","D","s","S","q","Q","e","E","x","X",
        "p","P","r","R",
      ]);
      if (handled.has(k)) e.preventDefault();

      // Global pause/resume (pause only the game loop; keep shader running)
      if ((k === "p" || k === "P") && down) {
        if (runningRef.current) {
          runningRef.current = false;
          cancelAnimationFrame(rafGameRef.current);
        } else {
          runningRef.current = true;
          tPrevRef.current = performance.now();
          accRef.current = 0;
          rafGameRef.current = requestAnimationFrame(loop);
        }
        return;
      }

      // Global restart both (one-shot)
      if ((k === "r" || k === "R") && down && !e.repeat) {
        p1Ref.current = createGame(BOARD_W, BOARD_H, (Math.random() * 0xffffff) | 0);
        p2Ref.current = createGame(BOARD_W, BOARD_H, (Math.random() * 0xffffff) | 0);
        return;
      }

      // ---------- P1 (left): WASD move, Q/E rotate, X hard drop ----------
      if (down && !e.repeat) {
        if (k === "x" || k === "X") p1InRef.current.hardDrop = true;   // hard drop
        if (k === "q" || k === "Q") p1InRef.current.rotCCW  = true;    // rotate CCW
        if (k === "e" || k === "E") p1InRef.current.rotCW   = true;    // rotate CW
      }
      switch (k) {
        case "a": case "A": p1InRef.current.left     = down; break;
        case "d": case "D": p1InRef.current.right    = down; break;
        case "s": case "S": p1InRef.current.softDrop = down; break;
      }

      // ---------- P2 (right): arrows move, ↑ rotate CW, Space hard drop ----------
      if (down && !e.repeat) {
        if (k === " ")           p2InRef.current.hardDrop = true; // hard drop
        if (k === "ArrowUp")     p2InRef.current.rotCW    = true; // rotate CW
      }
      switch (k) {
        case "ArrowLeft":  p2InRef.current.left     = down; break;
        case "ArrowRight": p2InRef.current.right    = down; break;
        case "ArrowDown":  p2InRef.current.softDrop = down; break;
      }
    }

    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd, { passive: false });
    window.addEventListener("keyup", ku,   { passive: false });

    // Release held movement keys if focus is lost (prevents "stuck" movement)
    function onBlur() {
      p1InRef.current.left = p1InRef.current.right = p1InRef.current.softDrop = false;
      p2InRef.current.left = p2InRef.current.right = p2InRef.current.softDrop = false;
    }
    window.addEventListener("blur", onBlur);

    // keep CSS size pinned
    function onResize() {
      const c = webglCanvasRef.current!;
      if (!c) return;
      c.style.width = "100vw";
      c.style.height = "100vh";
    }
    window.addEventListener("resize", onResize);
    onResize();

    return () => {
      cancelAnimationFrame(rafGameRef.current);
      cancelAnimationFrame(rafShaderRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", kd as any);
      window.removeEventListener("keyup", ku as any);
      window.removeEventListener("blur", onBlur);
      try { webglCanvasRef.current?.remove(); } catch {}
    };
  }, []);

  return <></>;
}

// ---------- Dual renderer (centers + DPR-correct) ----------
function makeDualRenderer(
  p1Ref: React.MutableRefObject<GameState>,
  p2Ref: React.MutableRefObject<GameState>,
  BOARD_W: number,
  BOARD_H: number,
  runningRef: { current: boolean }
) {
  const APPLE_FONT = "Apple II, ui-sans-serif, system-ui";

  return function renderDual(
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

    // background
    ctx.fillStyle = "#0a0f1a";
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);

    // layout in CSS px, draw in physical px
    const cssW = offscreen.width / DPR;
    const cssH = offscreen.height / DPR;
    const MARGIN = 24;
    const GAP = 28;
    const HUD_ROOM = 60;
    const aspect = BOARD_H / BOARD_W;

    const availW = cssW - MARGIN * 2 - GAP;
    const colW = Math.floor(availW / 2);
    const colH = Math.floor(colW * aspect);
    const availH = cssH - MARGIN * 2 - HUD_ROOM;
    const boardCssH = Math.min(colH, availH);
    const boardCssW = Math.floor(boardCssH / aspect);

    const leftCssX  = Math.floor(MARGIN + (colW - boardCssW) / 2);
    const rightCssX = Math.floor(MARGIN + colW + GAP + (colW - boardCssW) / 2);
    const cssY      = Math.floor((cssH - boardCssH) / 2 + 20);

    const pxW  = Math.floor(boardCssW * DPR);
    const pxH  = Math.floor(boardCssH * DPR);
    const pxX1 = Math.floor(leftCssX  * DPR);
    const pxX2 = Math.floor(rightCssX * DPR);
    const pxY  = Math.floor(cssY * DPR);

    drawBoard(ctx, p1Ref.current, pxX1, pxY, pxW, pxH, APPLE_FONT, DPR, BOARD_W, BOARD_H);
    drawBoard(ctx, p2Ref.current, pxX2, pxY, pxW, pxH, APPLE_FONT, DPR, BOARD_W, BOARD_H);

    // paused overlay
    if (!runningRef.current) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      const minDim = Math.min(offscreen.width, offscreen.height);
      const titleSize = Math.max(24, Math.round(minDim * 0.06));
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,255,127,0.4)";
      ctx.shadowBlur = Math.ceil(4 * DPR);
      ctx.fillStyle = "#00ff7f";
      ctx.font = `900 ${titleSize}px ${APPLE_FONT}`;
      ctx.fillText("PAUSED", offscreen.width / 2, offscreen.height / 2);
      ctx.shadowBlur = 0;
    }
  };
}

function drawBoard(
  ctx: OffscreenCanvasRenderingContext2D,
  s: GameState,
  pxX: number, pxY: number, pxW: number, pxH: number,
  APPLE_FONT: string,
  DPR: number,
  BOARD_W: number,
  BOARD_H: number
) {
  // panel bg
  ctx.fillStyle = "#0e1626";
  ctx.fillRect(pxX, pxY, pxW, pxH);

  // cells
  const cell = pxW / BOARD_W;
  function drawCell(gx: number, gy: number) {
    const x = pxX + Math.floor(gx * cell);
    const y = pxY + Math.floor(gy * cell);
    ctx.fillStyle = "#00ff7f";
    ctx.fillRect(x, y, Math.ceil(cell), Math.ceil(cell));
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = Math.max(1, Math.floor(DPR));
    ctx.strokeRect(x + 0.5, y + 0.5, Math.ceil(cell) - 1, Math.ceil(cell) - 1);
  }

  for (let y = HIDDEN_ROWS; y < s.boardH; y++) {
    for (let x = 0; x < s.boardW; x++) {
      if (s.board[y][x]) drawCell(x, y - HIDDEN_ROWS);
    }
  }
  if (s.active) {
    for (const [cx, cy] of shapeCells(s.active.type, s.active.rot)) {
      const gx = s.active.x + cx;
      const gy = s.active.y + cy;
      if (gy >= HIDDEN_ROWS && gy < s.boardH) drawCell(gx, gy - HIDDEN_ROWS);
    }
  }

  // border
  ctx.strokeStyle = "#00ff7f";
  ctx.lineWidth = Math.max(2, Math.round(2 * DPR));
  ctx.strokeRect(pxX + 0.5, pxY + 0.5, pxW - 1, pxH - 1);

  // per-board HUD (single-player style)
  const minDim = Math.min(ctx.canvas.width, ctx.canvas.height);
  const hudTitlePx = Math.max(14, Math.round(minDim * 0.018));
  const hudGapPx   = Math.max(6, Math.round(hudTitlePx * 0.4));
  const hudX = Math.round(pxX + pxW / 2);
  const hudY = Math.round(pxY - hudGapPx * 1.2);

  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "#00ff7f";
  ctx.font = `bold ${hudTitlePx}px ${APPLE_FONT}`;
  ctx.shadowColor = "rgba(0,255,127,0.25)";
  ctx.shadowBlur = Math.ceil(2 * DPR);

  const hudText = `Score: ${s.score.toLocaleString()} • Level: ${s.level} • Lines: ${s.lines}`;
  ctx.fillText(hudText, hudX, hudY);

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.35;
  const w = ctx.measureText(hudText).width;
  ctx.fillRect(hudX - Math.ceil(w / 2), hudY + Math.ceil(DPR), Math.ceil(w), Math.ceil(DPR));
  ctx.globalAlpha = 1;

  // panel GAME OVER
  if (s.gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(pxX, pxY, pxW, pxH);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#00ff7f";
    ctx.font = `900 ${Math.max(16, Math.round(pxW * 0.15))}px ${APPLE_FONT}`;
    ctx.fillText("GAME OVER", pxX + pxW / 2, pxY + pxH / 2);
  }
}
