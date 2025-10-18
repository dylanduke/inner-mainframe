// src/game/CanvasGame.tsx
import React, { useEffect, useRef, type JSX } from "react";
import {
  createGame, step, DEFAULT_PARAMS, type GameState, type Inputs, HIDDEN_ROWS
} from "@inner-mainframe/game-logic";
import { createOffscreenCanvas, drawWithShaders, setupWebglCanvas } from "@hackvegas-2025/shared";
import { makeGameRenderer } from "./makeGameRenderer";
// pick your tint (maps to shader theme)
import { Color } from "@hackvegas-2025/shared"; // same enum you used

const BOARD_W = 10;
const BOARD_H = 20;

export default function CanvasGame(): JSX.Element {
  // HUD + runtime as before
  const mountRef = useRef<HTMLDivElement | null>(null);      // NEW: where we insert the WebGL canvas
  const statsRef = useRef<HTMLDivElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const lastHudRef = useRef({ lines: -1 });

  const runningRef = useRef(true);
  const rafGameRef = useRef(0);
  const rafShaderRef = useRef(0);
  const tPrevRef = useRef(0);
  const accRef = useRef(0);

  const gameRef = useRef<GameState>(createGame(BOARD_W, BOARD_H, 0xC0FFEE));
  const inputsRef = useRef<Inputs>({});

  // webgl/shader objects
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
  const shaderDataRef = useRef<any>(null);
  const offscreenRef = useRef<OffscreenCanvas | null>(null);
  const offctxRef = useRef<OffscreenCanvasRenderingContext2D | null>(null);

  useEffect(() => {
    // --- setup WebGL pipeline once ---
    const { offscreenCanvas, offscreenCtx } = createOffscreenCanvas();
    offscreenRef.current = offscreenCanvas;
    offctxRef.current = offscreenCtx;

    const { canvas, gl, shaderData } = setupWebglCanvas(offscreenCanvas, offscreenCtx);
    webglCanvasRef.current = canvas;
    glRef.current = gl;
    shaderDataRef.current = shaderData;

    // place the WebGL canvas in the DOM
    if (mountRef.current) mountRef.current.appendChild(canvas);

    // renderer that the shader pipeline will call to draw the *game* into the offscreen
    const renderGameToOffscreen = makeGameRenderer(gameRef, BOARD_W, BOARD_H);

    // shader RAF: only post-process + present
    function drawShaders() {
      const gl = glRef.current as any;
      const c = webglCanvasRef.current!;
      const data = shaderDataRef.current!;
      // `textHeight` is used for scanline frequency calc in your CRT shader.
      // For Tetris we can pick a stable baseline (e.g., size of a "glyph row"). Use a constant like 24.
      drawWithShaders(gl, c, data, renderGameToOffscreen, Color.green, /*textHeight*/ 24);
      rafShaderRef.current = requestAnimationFrame(drawShaders);
    }
    rafShaderRef.current = requestAnimationFrame(drawShaders);

    // --- game loop: fixed-step update only (no direct drawing) ---
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

    function updateHudOnClearOnly() {
      const s = gameRef.current;
      if (s.lines !== lastHudRef.current.lines) {
        if (hudRef.current) {
          hudRef.current.textContent = `Score: ${s.score.toLocaleString()} • Level: ${s.level} • Lines: ${s.lines}`;
        }
        lastHudRef.current = { lines: s.lines };
      }
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

      updateHudOnClearOnly();

      // FPS stat (shader FPS ~ game FPS here)
      frames++;
      if (now - last > 500) {
        const fps = Math.round((frames * 1000) / (now - last));
        frames = 0;
        last = now;
        if (statsRef.current) {
          statsRef.current.textContent = `DPR ${Math.min(2, window.devicePixelRatio || 1)} • ${fps} FPS`;
        }
      }

      rafGameRef.current = requestAnimationFrame(loop);
    }

    tPrevRef.current = performance.now();
    accRef.current = 0;
    rafGameRef.current = requestAnimationFrame(loop);

    // inputs (unchanged)
    function onKey(e: KeyboardEvent, down: boolean) {
      if ((e.key === "p" || e.key === "P") && down) {
        runningRef.current = !runningRef.current;
        if (runningRef.current) {
          tPrevRef.current = performance.now();
          accRef.current = 0;
          rafGameRef.current = requestAnimationFrame(loop);
          rafShaderRef.current = requestAnimationFrame(drawShaders);
        } else {
          cancelAnimationFrame(rafGameRef.current);
          cancelAnimationFrame(rafShaderRef.current);
        }
        return;
      }
      if (down && !e.repeat) {
        if (e.key === " ") inputsRef.current.hardDrop = true;
        if (e.key === "ArrowUp") inputsRef.current.rotCW = true;
        if (e.key === "q" || e.key === "Q") inputsRef.current.rotCCW = true;
        if (e.key === "e" || e.key === "E") inputsRef.current.rotCW = true;
        if (e.key === "r" || e.key === "R") {
          gameRef.current = createGame(BOARD_W, BOARD_H, (Math.random() * 0xffffff) | 0);
          lastHudRef.current = { lines: -1 };
          return;
        }
      }
      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A": inputsRef.current.left = down; break;
        case "ArrowRight":
        case "d":
        case "D": inputsRef.current.right = down; break;
        case "ArrowDown":
        case "s":
        case "S": inputsRef.current.softDrop = down; break;
      }
    }
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    // resize just needs to trigger WebGL canvas CSS size; shader driver already reads DPR/rect each frame
    function onResize() {
      // style width/height for the WebGL canvas; internal buffer is resized in drawWithShaders
      const c = webglCanvasRef.current!;
      const MARGIN = 24;
      const vw = window.innerWidth, vh = window.innerHeight;
      const aspect = BOARD_H / BOARD_W; // 2:1
      const maxByW = Math.max(0, vw - MARGIN * 2);
      const maxByH = Math.max(0, (vh - MARGIN * 2) / aspect);
      const cssW = Math.floor(Math.min(maxByW, maxByH) * 0.85);
      const cssH = Math.floor(cssW * aspect);
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    }
    window.addEventListener("resize", onResize);
    onResize();

    return () => {
      cancelAnimationFrame(rafGameRef.current);
      cancelAnimationFrame(rafShaderRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      // remove the WebGL canvas from DOM (optional)
      try { webglCanvasRef.current?.remove(); } catch {}
    };
  }, []);

  // UI layout stays the same, but we swap the visible <canvas> for a mount div
  return (
    <div style={{
      width: "100vw", height: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "#0a0f1a", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* WebGL column */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div
            ref={mountRef}
            style={{
              border: "2px solid #1f2937",
              borderRadius: 8,
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              // The WebGL canvas will be appended here and sized via onResize()
            }}
          />
          <div ref={statsRef}
               style={{ color: "#cbd5e1", fontFamily: "ui-sans-serif, system-ui", fontSize: 12, textAlign: "center" }}
          />
        </div>

        {/* Sidebar HUD unchanged */}
        <div style={{
          minWidth: 200, display: "grid", gap: 12, color: "#e5e7eb",
          fontFamily: "ui-sans-serif, system-ui",
        }}>
          <div ref={hudRef}
               style={{ padding: "12px 14px", background: "#0e1626", border: "1px solid #1f2937", borderRadius: 8, fontSize: 16 }}>
            Score: 0 • Level: 0 • Lines: 0
          </div>
          <div style={{
            padding: "10px 12px", background: "#0e1626", border: "1px solid #1f2937",
            borderRadius: 8, fontSize: 13, color: "#cbd5e1", lineHeight: 1.5,
          }}>
            Controls:<br />
            ←/→ move • ↑/Q/E rotate<br />
            ↓ soft drop <br />
            Space hard drop<br />
            R restart • P pause
          </div>
        </div>
      </div>
    </div>
  );
}
