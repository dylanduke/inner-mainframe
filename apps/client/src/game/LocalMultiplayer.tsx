// src/game/LocalMultiplayer.tsx
import React, { useEffect, useRef } from "react";
import {
  createGame, step, DEFAULT_PARAMS,
  type GameState, type Inputs, HIDDEN_ROWS, shapeCells
} from "@inner-mainframe/game-logic";
import { createOffscreenCanvas, drawWithShaders, setupWebglCanvas, Color } from "@hackvegas-2025/shared";
import * as spud from "@spud.gg/api"; // optional: used if connected

import appleFontUrl from "./apple-ii.ttf?url";

const BOARD_W = 10;
const BOARD_H = 20;
const FIXED_DT = 1 / 60;

export default function LocalMultiplayer(): JSX.Element {
  const statsRef = useRef<HTMLDivElement | null>(null);

  const runningRef = useRef(true);
  const rafGameRef = useRef(0);
  const rafShaderRef = useRef(0);
  const tPrevRef = useRef(0);
  const accRef = useRef(0);

  // two games + inputs
  const p1Ref = useRef<GameState>(createGame(BOARD_W, BOARD_H, 0xA11CE));
  const p2Ref = useRef<GameState>(createGame(BOARD_W, BOARD_H, 0xB0B00));
  const p1InRef = useRef<Inputs>({});
  const p2InRef = useRef<Inputs>({});

  // webgl/shader objects
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
  const shaderDataRef = useRef<any>(null);
  const offscreenRef = useRef<OffscreenCanvas | null>(null);
  const offctxRef = useRef<OffscreenCanvasRenderingContext2D | null>(null);

  useEffect(() => {
    // Load Apple II font
    try {
      const ff = new FontFace("Apple II", `url(${appleFontUrl})`, {
        style: "normal",
        weight: "400",
        display: "swap",
      });
      ff.load().then((f) => (document as any).fonts.add(f));
    } catch {}

    // Create offscreen + WebGL
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

    // renderer
    const renderDual = makeDualRenderer(p1Ref, p2Ref, BOARD_W, BOARD_H, runningRef);

    // pause helpers
    const resume = () => {
      if (runningRef.current) return;
      runningRef.current = true;
      tPrevRef.current = performance.now();
      accRef.current = 0;
      rafGameRef.current = requestAnimationFrame(loop);
    };
    const pause = () => {
      if (!runningRef.current) return;
      runningRef.current = false;
      cancelAnimationFrame(rafGameRef.current);
    };

    // optional gamepad mapping via spud
    function handlePads() {
      (spud as any).update?.();
      const gp = (spud as any).gamepads;
      if (!gp) return;

      // Start on any pad toggles pause
      if (gp.anyPlayer?.buttonJustPressed?.(spud.Button.Start)) {
        if (runningRef.current) pause(); else resume();
      }

      const p1 = gp.p1 ?? gp.connectedPlayers?.[0];
      const p2 = gp.p2 ?? gp.connectedPlayers?.[1];

      if (p1) mapPadToInputs(p1, p1InRef.current);
      if (p2) mapPadToInputs(p2, p2InRef.current);
    }

    function mapPadToInputs(pad: any, inputs: Inputs) {
      // one-shots
      if (pad.buttonJustPressed?.(spud.Button.South)) inputs.hardDrop = true; // A/✕
      if (pad.buttonJustPressed?.(spud.Button.West))  inputs.rotCCW = true;   // X/□
      if (pad.buttonJustPressed?.(spud.Button.North)) inputs.rotCW  = true;   // Y/△
      if (pad.buttonJustPressed?.(spud.Button.East))  inputs.rotCW  = true;   // B/○
      // held
      const dL = pad.isButtonDown?.(spud.Button.DpadLeft);
      const dR = pad.isButtonDown?.(spud.Button.DpadRight);
      const dD = pad.isButtonDown?.(spud.Button.DpadDown);
      const snap = pad.leftStick?.snap4 ?? { x: 0, y: 0 };
      inputs.left     = !!(dL || (snap.x ?? 0) < 0);
      inputs.right    = !!(dR || (snap.x ?? 0) > 0);
      inputs.softDrop = !!(dD || (snap.y ?? 0) > 0);
    }

    // shader RAF (keeps CRT/gamepads alive while paused)
    function drawShaders() {
      handlePads();
      const gl = glRef.current as any;
      const c = webglCanvasRef.current!;
      const data = shaderDataRef.current!;
      // green theme; textHeight=24
      drawWithShaders(gl, c, data, renderDual, Color.green, 24);
      rafShaderRef.current = requestAnimationFrame(drawShaders);
    }
    rafShaderRef.current = requestAnimationFrame(drawShaders);

    // game loop (both players)
    let frames = 0, last = performance.now();
    function tickOne(gs: GameState, ins: Inputs, dt: number) {
      step(gs, ins, dt * 1000, DEFAULT_PARAMS);
      // clear one-shots
      ins.rotCW = false; ins.rotCCW = false; ins.hardDrop = false; ins.respawn = false;
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

      // stats
      frames++;
      if (now - last > 500) {
        const fps = Math.round((frames * 1000) / (now - last));
        frames = 0; last = now;
        if (statsRef.current) {
          const pads = spud.gamepads?.playerCount ?? 0;
          statsRef.current.textContent = `Local 2P • Pads ${pads} • DPR ${Math.min(2, window.devicePixelRatio || 1)} • ${fps} FPS`;
        }
      }

      rafGameRef.current = requestAnimationFrame(loop);
    }

    tPrevRef.current = performance.now();
    accRef.current = 0;
    rafGameRef.current = requestAnimationFrame(loop);

    // keyboard bindings
    function onKey(e: KeyboardEvent, down: boolean) {
      // global pause
      if ((e.key === "p" || e.key === "P") && down) {
        if (runningRef.current) pause(); else resume();
        return;
      }

      // restart both
      if ((e.key === "r" || e.key === "R") && down && !e.repeat) {
        p1Ref.current = createGame(BOARD_W, BOARD_H, (Math.random()*0xffffff)|0);
        p2Ref.current = createGame(BOARD_W, BOARD_H, (Math.random()*0xffffff)|0);
        return;
      }

      // --- P1: Arrows + Q/E + Space ---
      if (down && !e.repeat) {
        if (e.key === " ") p1InRef.current.hardDrop = true;
        if (e.key === "ArrowUp") p1InRef.current.rotCW = true;
        if (e.key === "q" || e.key === "Q") p1InRef.current.rotCCW = true;
        if (e.key === "e" || e.key === "E") p1InRef.current.rotCW = true;
      }
      switch (e.key) {
        case "ArrowLeft": p1InRef.current.left = down; break;
        case "ArrowRight": p1InRef.current.right = down; break;
        case "ArrowDown": p1InRef.current.softDrop = down; break;
      }

      // --- P2: WASD + F/G + Shift ---
      if (down && !e.repeat) {
        if (e.key === "Shift") p2InRef.current.hardDrop = true;
        if (e.key === "f" || e.key === "F") p2InRef.current.rotCW = true;
        if (e.key === "g" || e.key === "G") p2InRef.current.rotCCW = true;
      }
      switch (e.key) {
        case "a": case "A": p2InRef.current.left = down; break;
        case "d": case "D": p2InRef.current.right = down; break;
        case "s": case "S": p2InRef.current.softDrop = down; break;
      }
    }
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

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
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      try { webglCanvasRef.current?.remove(); } catch {}
    };
  }, []);

  return (
    <div
      ref={statsRef}
      style={{
        position: "fixed",
        top: 8,
        left: 10,
        zIndex: 2,
        color: "#cbd5e1",
        fontFamily: "Apple II, ui-sans-serif, system-ui",
        fontSize: 12,
        pointerEvents: "none",
        textShadow: "0 1px 2px rgba(0,0,0,0.8)",
      }}
    />
  );
}

// ---- dual renderer: draws both boards into the same offscreen (CRT-ready) ----
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

    const vw = offscreen.width / DPR;
    const vh = offscreen.height / DPR;
    const margin = 24;
    const gap = 28;
    const aspect = BOARD_H / BOARD_W;

    // split the width into two columns with a gap
    const totalW = vw - margin*2 - gap;
    const colW = Math.floor(totalW / 2);
    const colH = Math.floor(colW * aspect);
    const maxH = vh - margin*2 - 60; // leave HUD room
    const cssH = Math.min(colH, maxH);
    const cssW = Math.floor(cssH / aspect);

    const leftX = Math.floor(margin + (colW - cssW)/2);
    const rightX = Math.floor(margin + colW + gap + (colW - cssW)/2);
    const y = Math.floor((vh - cssH)/2 + 20);

    drawBoard(ctx, p1Ref.current, leftX, y, cssW, cssH, "#00ff7f", "P1", APPLE_FONT, DPR, BOARD_W, BOARD_H);
    drawBoard(ctx, p2Ref.current, rightX, y, cssW, cssH, "#60a5fa", "P2", APPLE_FONT, DPR, BOARD_W, BOARD_H);

    // center top title
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#00ff7f";
    ctx.font = `700 ${Math.max(14, Math.round(vw * 0.018))}px ${APPLE_FONT}`;
    ctx.shadowColor = "rgba(0,255,127,0.25)";
    ctx.shadowBlur = Math.ceil(2 * DPR);
    ctx.fillText("LOCAL MULTIPLAYER", offscreen.width/2, Math.max(10, Math.round(10 * DPR)));
    ctx.shadowBlur = 0;

    // paused overlay (for both)
    if (!runningRef.current) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#00ff7f";
      ctx.font = `900 ${Math.max(24, Math.round(Math.min(vw, vh) * 0.06))}px ${APPLE_FONT}`;
      ctx.shadowColor = "rgba(0,255,127,0.4)";
      ctx.shadowBlur = Math.ceil(4 * DPR);
      ctx.fillText("PAUSED", offscreen.width/2, offscreen.height/2);
      ctx.shadowBlur = 0;
    }
  };
}

function drawBoard(
  ctx: OffscreenCanvasRenderingContext2D,
  s: GameState,
  pxX: number, pxY: number, pxW: number, pxH: number,
  accent: string,
  label: string,
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
    ctx.fillStyle = accent;
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
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, Math.round(2 * DPR));
  ctx.strokeRect(pxX + 0.5, pxY + 0.5, pxW - 1, pxH - 1);

  // HUD line
  const hudY = Math.round(pxY - 10);
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = accent;
  ctx.font = `bold ${Math.max(12, Math.round(pxW * 0.06))}px ${APPLE_FONT}`;
  const hud = `${label} • Score: ${s.score.toLocaleString()} • L${s.level} • ${s.lines} lines`;
  ctx.fillText(hud, pxX + Math.round(pxW / 2), hudY);

  // game over overlay on panel
  if (s.gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(pxX, pxY, pxW, pxH);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = accent;
    ctx.font = `900 ${Math.max(16, Math.round(pxW * 0.15))}px ${APPLE_FONT}`;
    ctx.fillText("GAME OVER", pxX + pxW / 2, pxY + pxH / 2);
  }
}
