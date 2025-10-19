// src/game/CanvasGame.tsx
import React, { useEffect, useRef, type JSX } from "react";
import {
  createGame, step, DEFAULT_PARAMS, type GameState, type Inputs
} from "@inner-mainframe/game-logic";
import { createOffscreenCanvas, drawWithShaders, setupWebglCanvas } from "@hackvegas-2025/shared";
import { makeGameRenderer } from "./makeGameRenderer";
import { Color } from "@hackvegas-2025/shared";
import appleFontUrl from "./apple-ii.ttf?url";

// Spud
import { gamepads, Button, HapticIntensity } from "@spud.gg/api";

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

  // per-frame latched one-shot flags (edge triggers)
  const edgeRef = useRef({
    rotCW: false,
    rotCCW: false,
    hardDrop: false,
    restart: false,
    pause: false,
  });

  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | WebGL2RenderingContext | null>(null);
  const shaderDataRef = useRef<any>(null);
  const offscreenRef = useRef<OffscreenCanvas | null>(null);
  const offctxRef = useRef<OffscreenCanvasRenderingContext2D | null>(null);

  useEffect(() => {
    // Font
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

    const renderGameToOffscreen = makeGameRenderer(gameRef, BOARD_W, BOARD_H, runningRef);

    function drawShaders() {
      const gl = glRef.current as any;
      const c = webglCanvasRef.current!;
      const data = shaderDataRef.current!;
      drawWithShaders(gl, c, data, renderGameToOffscreen, Color.green, 24);
      rafShaderRef.current = requestAnimationFrame(drawShaders);
    }
    rafShaderRef.current = requestAnimationFrame(drawShaders);

    // Helpers
    function togglePause() {
      runningRef.current = !runningRef.current;
      // reset time origin so we don't jump when unpausing
      tPrevRef.current = performance.now();
      accRef.current = 0;
    }

    function restartGame() {
      gameRef.current = createGame(BOARD_W, BOARD_H, (Math.random() * 0xffffff) | 0);
      lastHudRef.current = { lines: -1 };
      if (hudRef.current) {
        hudRef.current.textContent = `Score: 0 • Level: ${gameRef.current.level}`;
      }
      try { gamepads.singlePlayer.rumble(60, HapticIntensity.Balanced); } catch {}
    }

    // -------- Spud sampling (once per rAF) ----------
    function sampleGamepadPerFrame() {
      const p = gamepads.singlePlayer;

      // Held movement: DPad OR left stick (snap4)
      const snap = p.leftStick.snap4;
      inputsRef.current.left = p.isButtonDown(Button.DpadLeft) || snap.x < -0.5;
      inputsRef.current.right = p.isButtonDown(Button.DpadRight) || snap.x > 0.5;
      inputsRef.current.softDrop = p.isButtonDown(Button.DpadDown) || snap.y > 0.5;

      // Edge-trigger latching (only set true here; consumed once inside fixed-step)
      if (p.buttonJustPressed(Button.East)) { // B / ○
        edgeRef.current.rotCW = true;
        try { p.rumble(40, HapticIntensity.Light); } catch {}
      }
      if (p.buttonJustPressed(Button.West)) { // X / □
        edgeRef.current.rotCCW = true;
        try { p.rumble(40, HapticIntensity.Light); } catch {}
      }
      if (p.buttonJustPressed(Button.South)) { // A / ✕
        edgeRef.current.hardDrop = true;
        try { p.rumble(50, HapticIntensity.Heavy); } catch {}
      }
      if (p.buttonJustPressed(Button.North)) { // Y / △
        edgeRef.current.restart = true;
      }
      if (p.buttonJustPressed(Button.Start) || p.buttonJustPressed(Button.Select)) {
        edgeRef.current.pause = true;
      }
    }

    // Keyboard (unchanged)
    function onKey(e: KeyboardEvent, down: boolean) {
      if ((e.key === "p" || e.key === "P") && down) {
        edgeRef.current.pause = true; // route through same pause path
        return;
      }
      if (down && !e.repeat) {
        if (e.key === " ") edgeRef.current.hardDrop = true;
        if (e.key === "ArrowUp") edgeRef.current.rotCW = true;
        if (e.key === "q" || e.key === "Q") edgeRef.current.rotCCW = true;
        if (e.key === "e" || e.key === "E") edgeRef.current.rotCW = true;
        if (e.key === "r" || e.key === "R") {
          edgeRef.current.restart = true;
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

    // Fixed-step loop (always runs so unpause is detectable)
    const FIXED_DT = 1 / 60;
    let frames = 0, last = performance.now();

    function runOneFixedStep(withEdges: boolean) {
      // inject latched edges exactly once per frame
      if (withEdges) {
        inputsRef.current.rotCW = edgeRef.current.rotCW;
        inputsRef.current.rotCCW = edgeRef.current.rotCCW;
        inputsRef.current.hardDrop = edgeRef.current.hardDrop;
        // respawn not used here; restart goes through restartGame
        edgeRef.current.rotCW = edgeRef.current.rotCCW = edgeRef.current.hardDrop = false;
      } else {
        inputsRef.current.rotCW = false;
        inputsRef.current.rotCCW = false;
        inputsRef.current.hardDrop = false;
      }

      step(gameRef.current, inputsRef.current, FIXED_DT * 1000, DEFAULT_PARAMS);

      // HUD updates when lines change
      const s = gameRef.current;
      if (s.lines !== lastHudRef.current.lines) {
        if (hudRef.current) {
          hudRef.current.textContent = `Score: ${s.score.toLocaleString()} • Level: ${s.level}`;
        }
        lastHudRef.current = { lines: s.lines };
      }

      // clear one-shots (safety—already cleared above)
      inputsRef.current.rotCW = false;
      inputsRef.current.rotCCW = false;
      inputsRef.current.hardDrop = false;
      inputsRef.current.respawn = false;
    }

    function loop() {
      const now = performance.now();
      let dt = (now - tPrevRef.current) / 1000;
      tPrevRef.current = now;

      // 1) Sample Spud exactly once per rAF
      sampleGamepadPerFrame();

      // 2) Handle pause/unpause & restart on edges (works even while paused)
      if (edgeRef.current.pause) {
        edgeRef.current.pause = false;
        togglePause();
      }
      if (edgeRef.current.restart) {
        edgeRef.current.restart = false;
        restartGame();
      }

      // 3) Fixed update(s)
      if (runningRef.current) {
        accRef.current += dt;
        let firstStep = true;
        while (accRef.current >= FIXED_DT) {
          runOneFixedStep(firstStep);  // edges only on first step
          firstStep = false;
          accRef.current -= FIXED_DT;
        }
      } else {
        // paused: don’t accumulate; keep inputs clean per frame
        accRef.current = 0;
      }

      // 4) Stats & Spud housekeeping
      frames++;
      if (now - last > 500) {
        const fps = Math.round((frames * 1000) / (now - last));
        frames = 0;
        last = now;
        if (statsRef.current) {
          statsRef.current.textContent =
            `Pads ${gamepads.playerCount} • DPR ${Math.min(2, window.devicePixelRatio || 1)} • ${fps} FPS`;
        }
      }

      // Spud: clear after you’ve consumed buttonJustPressed for this frame
      gamepads.clearInputs();

      rafGameRef.current = requestAnimationFrame(loop);
    }

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
          <div
            ref={statsRef}
            style={{ color: "#cbd5e1", fontFamily: "ui-sans-serif, system-ui", fontSize: 12, textAlign: "center" }}
          />
        </div>

        {/* HUD simplified */}
        <div style={{
          minWidth: 200, display: "grid", gap: 12, color: "#e5e7eb",
          fontFamily: "ui-sans-serif, system-ui",
        }}>
          <div
            ref={hudRef}
            style={{ padding: "12px 14px", background: "#0e1626", border: "1px solid #1f2937", borderRadius: 8, fontSize: 16 }}>
            Score: 0 • Level: 0
          </div>
          <div style={{
            padding: "10px 12px", background: "#0e1626", border: "1px solid #1f2937",
            borderRadius: 8, fontSize: 13, color: "#cbd5e1", lineHeight: 1.5,
          }}>
            Controls:<br />
            D-Pad / Left-Stick: Move &amp; Soft Drop<br />
            B(○)=Rotate CW • X(□)=Rotate CCW<br />
            A(✕)=Hard Drop • Y(△)=Restart<br />
            Start/Select=Pause • Keyboard still works
          </div>
        </div>
      </div>
    </div>
  );
}
