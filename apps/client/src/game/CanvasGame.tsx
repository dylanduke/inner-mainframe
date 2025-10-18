// src/game/CanvasGame.tsx
import React, { useEffect, useRef, type JSX } from "react";
import {
  createGame,
  step,
  DEFAULT_PARAMS,
  shapeCells,
  type GameState,
  type Inputs,
  TILE, // optional; not required for drawing here
} from "@inner-mainframe/game-logic";

const BOARD_W = 10;
const BOARD_H = 20;

export default function CanvasGame(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statsRef = useRef<HTMLDivElement | null>(null);

  // runtime
  const runningRef = useRef(true);
  const rafRef = useRef(0);
  const tPrevRef = useRef(0);
  const accRef = useRef(0);

  // game state + inputs
  const gameRef = useRef<GameState>(createGame(BOARD_W, BOARD_H, 0xC0FFEE));
  const inputsRef = useRef<Inputs>({});

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    // --- Responsive canvas with board aspect (1:2) ---
    function layout() {
      const MARGIN_X = 24;
      const MARGIN_Y = 24;
      const SCALE_MULTIPLIER = 0.85; // ← reduce overall canvas size by 15%
    
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const aspect = BOARD_H / BOARD_W; // 2
    
      const maxByWidth  = Math.max(0, vw - MARGIN_X);
      const maxByHeight = Math.max(0, (vh - MARGIN_Y) / aspect);
    
      let cssW = Math.floor(Math.min(maxByWidth, maxByHeight));
      cssW = Math.floor(cssW * SCALE_MULTIPLIER); // apply proportional shrink
      const cssH = Math.floor(cssW * aspect);
    
      const DPR = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width  = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width  = Math.floor(cssW * DPR);
      canvas.height = Math.floor(cssH * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    
    

    function onResize() {
      layout();
      draw(); // redraw immediately after resize
    }
    window.addEventListener("resize", onResize);
    layout();

    // --- Input handling ---
    function onKey(e: KeyboardEvent, down: boolean) {
      if ((e.key === "p" || e.key === "P") && down) {
        runningRef.current = !runningRef.current;
        if (runningRef.current) {
          tPrevRef.current = performance.now();
          accRef.current = 0;
          loop();
        } else {
          cancelAnimationFrame(rafRef.current);
        }
        return;
      }

      if (down && !e.repeat) {
        if (e.key === "r" || e.key === "R") inputsRef.current.respawn = true;
        if (e.key === "ArrowUp") inputsRef.current.rotCW = true;
        if (e.key === "q" || e.key === "Q") inputsRef.current.rotCCW = true;
        if (e.key === "e" || e.key === "E") inputsRef.current.rotCW = true;
        if (e.key === " ") inputsRef.current.hardDrop = true;
      }

      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          inputsRef.current.left = down;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          inputsRef.current.right = down;
          break;
        case "ArrowDown":
        case "s":
        case "S":
          inputsRef.current.softDrop = down;
          break;
      }
    }
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    // --- Draw helpers (cells fill canvas exactly) ---
    function getCellSize() {
      // Use the canvas *CSS* size for drawing in CSS pixels
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      return {
        cell: cssW / BOARD_W,   // width per cell
        cssW,
        cssH,                   // equals cell * BOARD_H by construction
      };
    }

    function drawCell(gx: number, gy: number) {
      const { cell } = getCellSize();
      const x = gx * cell;
      const y = gy * cell;
      // constant green
      ctx.fillStyle = "#00ff7f";
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }

    function draw() {
      const { cssW, cssH } = getCellSize();

      // background
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, cssW, cssH);

      // playfield bg (optional subtle contrast)
      ctx.fillStyle = "#0e1626";
      ctx.fillRect(0, 0, cssW, cssH);

      // board cells
      const s = gameRef.current;
      for (let y = 0; y < s.boardH; y++) {
        for (let x = 0; x < s.boardW; x++) {
          if (s.board[y][x]) drawCell(x, y);
        }
      }

      // active piece
      const p = s.active;
      if (p) {
        const cells = shapeCells(p.type, p.rot);
        for (const [cx, cy] of cells) {
          const gx = p.x + cx;
          const gy = p.y + cy;
          if (gy >= 0) drawCell(gx, gy);
        }
      }

      // outline
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, cssW, cssH);

      // HUD
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "14px ui-sans-serif, system-ui";
      ctx.fillText("←/→ move • ↑/Q/E rotate • ↓ soft • Space hard • R respawn • P pause", 12, 22);
    }

    // --- Fixed-step game loop ---
    const FIXED_DT = 1 / 60;
    let frames = 0, last = performance.now();

    function update(dt: number) {
      step(gameRef.current, inputsRef.current, dt * 1000, DEFAULT_PARAMS);
      // clear one-shots
      inputsRef.current.rotCW = false;
      inputsRef.current.rotCCW = false;
      inputsRef.current.hardDrop = false;
      inputsRef.current.respawn = false;
    }

    function loop() {
      if (!runningRef.current) return;
      const now = performance.now();
      let dt = (now - tPrevRef.current) / 1000;
      tPrevRef.current = now;

      accRef.current += dt;
      while (accRef.current >= FIXED_DT) {
        update(FIXED_DT);
        accRef.current -= FIXED_DT;
      }
      draw();

      // FPS stat
      frames++;
      if (now - last > 500) {
        const fps = Math.round((frames * 1000) / (now - last));
        frames = 0; last = now;
        if (statsRef.current) statsRef.current.textContent = `DPR ${Math.min(2, window.devicePixelRatio||1)} • ${fps} FPS`;
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    // start
    tPrevRef.current = performance.now();
    accRef.current = 0;
    loop();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  // center the canvas on the page
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0f1a",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <canvas
          ref={canvasRef}
          style={{
            border: "2px solid #1f2937",
            borderRadius: 8,
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
        />
        <div
          ref={statsRef}
          style={{ color: "#cbd5e1", fontFamily: "ui-sans-serif, system-ui", fontSize: 12, textAlign: "center" }}
        />
      </div>
    </div>
  );
}
