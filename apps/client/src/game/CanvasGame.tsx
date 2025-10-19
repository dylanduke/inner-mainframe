// src/game/CanvasGame.tsx
import React, { useEffect, useRef, type JSX } from "react";
import {
  createGame, step, DEFAULT_PARAMS, type GameState, type Inputs
} from "@inner-mainframe/game-logic";
import { createOffscreenCanvas, drawWithShaders, setupWebglCanvas } from "@hackvegas-2025/shared";
import { makeGameRenderer } from "./makeGameRenderer";
import { Color } from "@hackvegas-2025/shared";
import appleFontUrl from "./apple-ii.ttf?url";

const BOARD_W = 10;
const BOARD_H = 20;

export default function CanvasGame(): JSX.Element {
  const mountRef = useRef<HTMLDivElement | null>(null);
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

  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
  const shaderDataRef = useRef<any>(null);
  const offscreenRef = useRef<OffscreenCanvas | null>(null);
  const offctxRef = useRef<OffscreenCanvasRenderingContext2D | null>(null);

  useEffect(() => {
    try {
      const ff = new FontFace("Apple II", `url(${appleFontUrl})`, {
        style: "normal",
        weight: "400",
        display: "swap",
      });
      ff.load().then((f) => (document as any).fonts.add(f));
    } catch (e) {
      console.warn("Font load failed", e);
    }
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

    const renderGameToOffscreen = makeGameRenderer(gameRef, BOARD_W, BOARD_H, runningRef);

    function drawShaders() {
      const gl = glRef.current as any;
      const c = webglCanvasRef.current!;
      const data = shaderDataRef.current!;
      drawWithShaders(gl, c, data, renderGameToOffscreen, Color.green, 24);
      rafShaderRef.current = requestAnimationFrame(drawShaders);
    }
    rafShaderRef.current = requestAnimationFrame(drawShaders);

    const FIXED_DT = 1 / 60;
    let frames = 0, last = performance.now();

    function update(dt: number) {
      step(gameRef.current, inputsRef.current, dt * 1000, DEFAULT_PARAMS);

      // HUD refresh only when lines changed (score changes only then)
      const s = gameRef.current;
      if (s.lines !== lastHudRef.current.lines) {
        if (hudRef.current) {
          hudRef.current.textContent = `Score: ${s.score.toLocaleString()} • Level: ${s.level}`;
        }
        lastHudRef.current = { lines: s.lines };
      }

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

    function onKey(e: KeyboardEvent, down: boolean) {
      if ((e.key === "p" || e.key === "P") && down) {
        runningRef.current = !runningRef.current;

        if (runningRef.current) {
          tPrevRef.current = performance.now();
          accRef.current = 0;
          rafGameRef.current = requestAnimationFrame(loop);
        } else {
          cancelAnimationFrame(rafGameRef.current);
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
          if (hudRef.current) {
            hudRef.current.textContent = `Score: 0 • Level: ${gameRef.current.level}`;
          }
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
    <div style={{
      width: "100vw", height: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "#0a0f1a", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div
            ref={mountRef}
            style={{
              border: "2px solid #1f2937",
              borderRadius: 8,
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            }}
          />
          <div ref={statsRef}
               style={{ color: "#cbd5e1", fontFamily: "ui-sans-serif, system-ui", fontSize: 12, textAlign: "center" }}
          />
        </div>

        {/* HUD simplified: no Lines */}
        <div style={{
          minWidth: 200, display: "grid", gap: 12, color: "#e5e7eb",
          fontFamily: "ui-sans-serif, system-ui",
        }}>
          <div ref={hudRef}
               style={{ padding: "12px 14px", background: "#0e1626", border: "1px solid #1f2937", borderRadius: 8, fontSize: 16 }}>
            Score: 0 • Level: 0
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
