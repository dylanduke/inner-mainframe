// src/game/LocalMultiplayer.tsx
import React, { useEffect, useRef } from "react";
import {
  createGame, step, DEFAULT_PARAMS,
  type GameState, type Inputs, HIDDEN_ROWS, shapeCells
} from "@inner-mainframe/game-logic";
import { createOffscreenCanvas, drawWithShaders, setupWebglCanvas, Color } from "@hackvegas-2025/shared";
import appleFontUrl from "./apple-ii.ttf?url";

// 🔊 sound
import { useSound } from "./sfx/SoundProvider";
import bgmUrl from "./sfx/bgm.wav?url";

// Spud gamepad support
import { gamepads, Button, HapticIntensity } from "@spud.gg/api";

const BOARD_W = 10;
const BOARD_H = 20;
const FIXED_DT = 1 / 60;

export default function LocalMultiplayer(): JSX.Element {
  // runtime flags
  const runningRef = useRef(true);
  const matchOverRef = useRef(false);
  const rafGameRef = useRef(0);
  const rafShaderRef = useRef(0);
  const tPrevRef = useRef(0);
  const accRef = useRef(0);

  // game states & inputs
  const p1Ref = useRef<GameState>(createGame(BOARD_W, BOARD_H, 0x0a11ce));
  const p2Ref = useRef<GameState>(createGame(BOARD_W, BOARD_H, 0x0b0b00));
  const p1InRef = useRef<Inputs>({});
  const p2InRef = useRef<Inputs>({});

  // 🔊 SFX
  const { play } = useSound();
  const p1PrevLinesRef = useRef(0);
  const p2PrevLinesRef = useRef(0);
  const p1PrevFilledRef = useRef(0);
  const p2PrevFilledRef = useRef(0);
  const p1EndPlayedRef = useRef(false);
  const p2EndPlayedRef = useRef(false);

  // 🔊 BGM
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  // keyboard-held state lives SEPARATELY from the per-frame input objects
  const kbHeldRef = useRef({
    p1: { left: false, right: false, softDrop: false },
    p2: { left: false, right: false, softDrop: false },
  });

  // per-frame latched edges (consumed once on the first fixed step each frame)
  const edgesRef = useRef({
    p1: { rotCW: false, rotCCW: false, hardDrop: false },
    p2: { rotCW: false, rotCCW: false, hardDrop: false },
    pause: false,
    restart: false,
  });

  // seat bindings: lock P1->index 0, P2->index 1 (no tap-to-claim)
  const seatRef = useRef<{ p1: 0 | 1 | 2 | 3 | null; p2: 0 | 1 | 2 | 3 | null }>({ p1: 0, p2: 1 });

  function padByIndex(i: 0 | 1 | 2 | 3 | null) {
    if (i === 0) return gamepads.p1;
    if (i === 1) return gamepads.p2;
    if (i === 2) return gamepads.p3;
    if (i === 3) return gamepads.p4;
    return gamepads.p1;
  }

  // webgl plumbing
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
  const shaderDataRef = useRef<any>(null);
  const offscreenRef = useRef<OffscreenCanvas | null>(null);
  const offctxRef = useRef<OffscreenCanvasRenderingContext2D | null>(null);

  // helpers
  const countFilled = (board: number[][]) => {
    let n = 0;
    for (let y = 0; y < board.length; y++) {
      const row = board[y];
      for (let x = 0; x < row.length; x++) if (row[x]) n++;
    }
    return n;
  };
  const isOver = (s: GameState) => !!(s.gameOver as any);

  useEffect(() => {
    // Font
    try {
      const ff = new FontFace("Apple II", `url(${appleFontUrl})`, { style: "normal", weight: "400", display: "swap" });
      ff.load().then((f) => (document as any).fonts.add(f));
    } catch {}

    // 🔊 init SFX trackers
    p1PrevLinesRef.current = p1Ref.current.lines ?? 0;
    p2PrevLinesRef.current = p2Ref.current.lines ?? 0;
    p1PrevFilledRef.current = countFilled(p1Ref.current.board);
    p2PrevFilledRef.current = countFilled(p2Ref.current.board);
    p1EndPlayedRef.current = p2EndPlayedRef.current = false;

    // 🔊 BGM create element (play/pause controlled in loop)
    {
      const a = new Audio(bgmUrl);
      a.loop = true;
      a.volume = 0.5;
      bgmRef.current = a;
    }

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

    const renderDual = makeDualRenderer(p1Ref, p2Ref, BOARD_W, BOARD_H, runningRef, matchOverRef);

    // --- Single shader loop ---
    function drawShaders() {
      const gl = glRef.current as any;
      const c = webglCanvasRef.current!;
      const data = shaderDataRef.current!;
      drawWithShaders(gl, c, data, renderDual, Color.green, 24);
      rafShaderRef.current = requestAnimationFrame(drawShaders);
    }
    rafShaderRef.current = requestAnimationFrame(drawShaders);

    // helpers ----------------------------------------------------

    function togglePause() {
      runningRef.current = !runningRef.current;
      // keep loop alive; just reset time origin so we don't jump after unpausing
      tPrevRef.current = performance.now();
      accRef.current = 0;
      // BGM handled in loop next frame
    }

    function restartMatch() {
      p1Ref.current = createGame(BOARD_W, BOARD_H, (Math.random() * 0xffffff) | 0);
      p2Ref.current = createGame(BOARD_W, BOARD_H, (Math.random() * 0xffffff) | 0);
      matchOverRef.current = false;
      runningRef.current = true;
      tPrevRef.current = performance.now();
      accRef.current = 0;

      // 🔊 reset trackers
      p1PrevLinesRef.current = p1Ref.current.lines ?? 0;
      p2PrevLinesRef.current = p2Ref.current.lines ?? 0;
      p1PrevFilledRef.current = countFilled(p1Ref.current.board);
      p2PrevFilledRef.current = countFilled(p2Ref.current.board);
      p1EndPlayedRef.current = p2EndPlayedRef.current = false;

      try { padByIndex(seatRef.current.p1).rumble(60, HapticIntensity.Balanced); } catch {}
      try { padByIndex(seatRef.current.p2).rumble(60, HapticIntensity.Balanced); } catch {}
    }

    function stopMatchIfOver() {
      if (!matchOverRef.current && (p1Ref.current.gameOver || p2Ref.current.gameOver)) {
        matchOverRef.current = true;
        runningRef.current = false;   // pause sim; loop keeps polling so restart works
      }
    }

    // tick one state once (with optional first-step edges)
    function tickOne(
      gs: GameState,
      ins: Inputs,
      firstStepEdges?: { rotCW: boolean; rotCCW: boolean; hardDrop: boolean }
    ) {
      if (firstStepEdges) {
        ins.rotCW = firstStepEdges.rotCW;
        ins.rotCCW = firstStepEdges.rotCCW;
        ins.hardDrop = firstStepEdges.hardDrop;
      } else {
        ins.rotCW = ins.rotCCW = ins.hardDrop = false;
      }

      step(gs, ins, FIXED_DT * 1000, DEFAULT_PARAMS);

      // one-shot buttons reset each fixed tick (safety)
      ins.rotCW = ins.rotCCW = ins.hardDrop = ins.respawn = false;
    }

    // -------- SAMPLE GAMEPADS ONCE PER FRAME --------------------
    function sampleGamepadsPerFrame() {
      const p1Pad = padByIndex(seatRef.current.p1);
      const p2Pad = padByIndex(seatRef.current.p2);

      const gpToHeldAndEdges = (p: typeof gamepads.p1) => {
        const held = { left: false, right: false, softDrop: false };
        const edges = { rotCW: false, rotCCW: false, hardDrop: false };

        if (p.gamepad) {
          const { x: sx, y: sy } = p.leftStick.snap4;
          held.left     = p.isButtonDown(Button.DpadLeft)  || sx < -0.5;
          held.right    = p.isButtonDown(Button.DpadRight) || sx > 0.5;
          held.softDrop = p.isButtonDown(Button.DpadDown)  || sy > 0.5;

          if (p.buttonJustPressed(Button.West))  edges.rotCCW = true; // X / □
          if (p.buttonJustPressed(Button.East))  edges.rotCW  = true; // B / ○
          if (p.buttonJustPressed(Button.South)) {                    // A / ✕
            edges.hardDrop = true;
            try { p.rumble(40, HapticIntensity.Balanced); } catch {}
          }
        }
        return { held, edges };
      };

      const gp1 = gpToHeldAndEdges(p1Pad);
      const gp2 = gpToHeldAndEdges(p2Pad);

      // Overwrite helds from (gamepadHeld OR keyboardHeld)
      p1InRef.current.left     = !!(gp1.held.left     || kbHeldRef.current.p1.left);
      p1InRef.current.right    = !!(gp1.held.right    || kbHeldRef.current.p1.right);
      p1InRef.current.softDrop = !!(gp1.held.softDrop || kbHeldRef.current.p1.softDrop);

      p2InRef.current.left     = !!(gp2.held.left     || kbHeldRef.current.p2.left);
      p2InRef.current.right    = !!(gp2.held.right    || kbHeldRef.current.p2.right);
      p2InRef.current.softDrop = !!(gp2.held.softDrop || kbHeldRef.current.p2.softDrop);

      // One-shots: latch per frame
      if (gp1.edges.rotCW)    edgesRef.current.p1.rotCW = true;
      if (gp1.edges.rotCCW)   edgesRef.current.p1.rotCCW = true;
      if (gp1.edges.hardDrop) edgesRef.current.p1.hardDrop = true;

      if (gp2.edges.rotCW)    edgesRef.current.p2.rotCW = true;
      if (gp2.edges.rotCCW)   edgesRef.current.p2.rotCCW = true;
      if (gp2.edges.hardDrop) edgesRef.current.p2.hardDrop = true;

      // Pause / Restart from either bound controller
      const p1Pause = p1Pad.buttonJustPressed(Button.Start) || p1Pad.buttonJustPressed(Button.Select);
      const p2Pause = p2Pad.buttonJustPressed(Button.Start) || p2Pad.buttonJustPressed(Button.Select);
      if (p1Pause || p2Pause) {
        edgesRef.current.pause = true;
      }
      const p1Restart = p1Pad.buttonJustPressed(Button.North);
      const p2Restart = p2Pad.buttonJustPressed(Button.North);
      if (p1Restart || p2Restart) {
        edgesRef.current.restart = true;
      }
      gamepads.clearInputs();
    }

    // Keyboard handling → writes to kbHeldRef (not the per-frame Inputs)
    function onKey(e: KeyboardEvent, down: boolean) {
      const k = e.key;
      const handled = new Set([
        "ArrowLeft","ArrowRight","ArrowDown","ArrowUp"," ",
        "a","A","d","D","s","S","q","Q","e","E","x","X",
        "p","P","r","R",
        ",",".","<",">",
      ]);
      if (handled.has(k)) e.preventDefault();

      // Pause / restart via edges
      if ((k === "p" || k === "P") && down) { edgesRef.current.pause = true; return; }
      if ((k === "r" || k === "R") && down && !e.repeat) { edgesRef.current.restart = true; return; }
      if (matchOverRef.current) return;

      // One-shots (edge latched)
      if (down && !e.repeat) {
        if (k === "x" || k === "X") edgesRef.current.p1.hardDrop = true;
        if (k === "q" || k === "Q") edgesRef.current.p1.rotCCW = true;
        if (k === "e" || k === "E") edgesRef.current.p1.rotCW  = true;

        if (k === " ") edgesRef.current.p2.hardDrop = true;
        if (k === "," || k === "<") edgesRef.current.p2.rotCCW = true;
        if (k === "." || k === ">") edgesRef.current.p2.rotCW  = true;
      }

      // Helds → update the separate kbHeldRef
      switch (k) {
        // P1 WASD
        case "a": case "A": kbHeldRef.current.p1.left = down; break;
        case "d": case "D": kbHeldRef.current.p1.right = down; break;
        case "s": case "S": kbHeldRef.current.p1.softDrop = down; break;
        // P2 arrows
        case "ArrowLeft":  kbHeldRef.current.p2.left = down; break;
        case "ArrowRight": kbHeldRef.current.p2.right = down; break;
        case "ArrowDown":  kbHeldRef.current.p2.softDrop = down; break;
      }
    }

    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd, { passive: false });
    window.addEventListener("keyup", ku, { passive: false });

    function onBlur() {
      kbHeldRef.current.p1.left = kbHeldRef.current.p1.right = kbHeldRef.current.p1.softDrop = false;
      kbHeldRef.current.p2.left = kbHeldRef.current.p2.right = kbHeldRef.current.p2.softDrop = false;
    }
    window.addEventListener("blur", onBlur);

    // main loop (always running so pads can unpause/restart)
    function loop() {
      const now = performance.now();
      let dt = (now - tPrevRef.current) / 1000;
      tPrevRef.current = now;

      // 1) Sample controllers once per rAF
      sampleGamepadsPerFrame();

      // 2) Global edges (work even while paused or match over)
      if (edgesRef.current.pause)   { edgesRef.current.pause = false; togglePause(); }
      if (edgesRef.current.restart) { edgesRef.current.restart = false; restartMatch(); }

      // 3) Fixed updates only if running
      if (runningRef.current && !matchOverRef.current) {
        accRef.current += dt;
        let first = true;
        while (accRef.current >= FIXED_DT) {
          tickOne(p1Ref.current, p1InRef.current, first ? edgesRef.current.p1 : undefined);
          tickOne(p2Ref.current, p2InRef.current, first ? edgesRef.current.p2 : undefined);
          first = false;
          accRef.current -= FIXED_DT;
        }
        // clear latched one-shots after first fixed step consumed them
        edgesRef.current.p1.rotCW = edgesRef.current.p1.rotCCW = edgesRef.current.p1.hardDrop = false;
        edgesRef.current.p2.rotCW = edgesRef.current.p2.rotCCW = edgesRef.current.p2.hardDrop = false;

        // ---- 🔊 SOUND EVENTS (per player) ----
        const p1 = p1Ref.current;
        const p2 = p2Ref.current;

        // Line clear → "clear"
        if (p1.lines > p1PrevLinesRef.current) play("clear");
        if (p2.lines > p2PrevLinesRef.current) play("clear");
        p1PrevLinesRef.current = p1.lines;
        p2PrevLinesRef.current = p2.lines;

        // Piece placed (board changed) → "drop"
        const p1Filled = countFilled(p1.board);
        const p2Filled = countFilled(p2.board);
        if (!isOver(p1) && p1Filled !== p1PrevFilledRef.current) play("drop");
        if (!isOver(p2) && p2Filled !== p2PrevFilledRef.current) play("drop");
        p1PrevFilledRef.current = p1Filled;
        p2PrevFilledRef.current = p2Filled;

        // Game over → "end" (once per player)
        if (isOver(p1) && !p1EndPlayedRef.current) { p1EndPlayedRef.current = true; play("end"); }
        if (isOver(p2) && !p2EndPlayedRef.current) { p2EndPlayedRef.current = true; play("end"); }
        if (!isOver(p1)) p1EndPlayedRef.current = false;
        if (!isOver(p2)) p2EndPlayedRef.current = false;

        // Determine match over
        if (!matchOverRef.current && (p1.gameOver || p2.gameOver)) {
          matchOverRef.current = true;
          runningRef.current = false;
        }
      } else {
        accRef.current = 0;
      }

      // 🔊 BGM control (kept outside so it also reacts on pause/over frames)
      const bgm = bgmRef.current;
      if (bgm) {
        const shouldPlay = runningRef.current && !matchOverRef.current;
        if (shouldPlay) {
          if (bgm.paused) bgm.play().catch(() => {});
        } else if (!bgm.paused) {
          bgm.pause();
        }
      }

      rafGameRef.current = requestAnimationFrame(loop);
    }

    // start main loop
    tPrevRef.current = performance.now();
    accRef.current = 0;
    rafGameRef.current = requestAnimationFrame(loop);

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

      // 🔊 BGM cleanup
      if (bgmRef.current) {
        try { bgmRef.current.pause(); } catch {}
        bgmRef.current.src = "";
        bgmRef.current = null;
      }

      try { webglCanvasRef.current?.remove(); } catch {}
    };
  }, [play]);

  return <></>;
}

// ---------------- Rendering ----------------

function makeDualRenderer(
  p1Ref: React.MutableRefObject<GameState>,
  p2Ref: React.MutableRefObject<GameState>,
  BOARD_W: number,
  BOARD_H: number,
  runningRef: { current: boolean },
  matchOverRef: { current: boolean }
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

    ctx.fillStyle = "#0a0f1a";
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);

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

    drawBoard(ctx, p1Ref.current, pxX1, pxY, pxW, pxH, APPLE_FONT, DPR, BOARD_W, BOARD_H, matchOverRef.current);
    drawBoard(ctx, p2Ref.current, pxX2, pxY, pxW, pxH, APPLE_FONT, DPR, BOARD_W, BOARD_H, matchOverRef.current);

    // global overlays
    if (!runningRef.current && !matchOverRef.current) {
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

    if (matchOverRef.current) {
      const p1Score = p1Ref.current.score;
      const p2Score = p2Ref.current.score;

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);

      const minDim = Math.min(offscreen.width, offscreen.height);
      const titleSize = Math.max(24, Math.round(minDim * 0.065));
      const subSize   = Math.max(14, Math.round(titleSize * 0.45));

      const winner =
        p1Score > p2Score ? "PLAYER 1 WINS" :
        p2Score > p1Score ? "PLAYER 2 WINS" :
        "TIE GAME";

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,255,127,0.4)";
      ctx.shadowBlur = Math.ceil(4 * DPR);
      ctx.fillStyle = "#00ff7f";

      ctx.font = `900 ${titleSize}px ${APPLE_FONT}`;
      ctx.fillText(winner, offscreen.width / 2, offscreen.height / 2 - titleSize * 0.7);

      ctx.font = `bold ${subSize}px ${APPLE_FONT}`;
      const scores = `P1 ${p1Score.toLocaleString()}  •  P2 ${p2Score.toLocaleString()}`;
      ctx.fillText(scores, offscreen.width / 2, offscreen.height / 2 + subSize * 0.2);

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
  BOARD_H: number,
  matchOver: boolean
) {
  ctx.fillStyle = "#0e1626";
  ctx.fillRect(pxX, pxY, pxW, pxH);

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

  ctx.strokeStyle = "#00ff7f";
  ctx.lineWidth = Math.max(2, Math.round(2 * DPR));
  ctx.strokeRect(pxX + 0.5, pxY + 0.5, pxW - 1, pxH - 1);

  // Simplified HUD: Score + Level (no Lines)
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

  const hudText = `Score: ${s.score.toLocaleString()} • Level: ${s.level}`;
  ctx.fillText(hudText, hudX, hudY);

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.35;
  const w = ctx.measureText(hudText).width;
  ctx.fillRect(hudX - Math.ceil(w / 2), hudY + Math.ceil(DPR), Math.ceil(w), Math.ceil(DPR));
  ctx.globalAlpha = 1;

  if (s.gameOver && !matchOver) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(pxX, pxY, pxW, pxH);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#00ff7f";
    ctx.font = `900 ${Math.max(16, Math.round(pxW * 0.15))}px ${APPLE_FONT}`;
    ctx.fillText("GAME OVER", pxX + pxW / 2, pxY + pxH / 2);
  }
}
