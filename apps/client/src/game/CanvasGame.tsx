// src/game/CanvasGame.tsx
import React, { useEffect, useRef, type JSX } from "react";
import {
  createGame,
  step,
  DEFAULT_PARAMS,
  shapeCells,
  type GameState,
  type Inputs,
  HIDDEN_ROWS,
} from "@inner-mainframe/game-logic";

// ---- MULTIPLAYER CONFIG ----
type Mode = "single" | "multi";
const MODE: Mode = "single"; // ← flip to "multi" to enable multiplayer behavior

// Colyseus client (only used if MODE === "multi")
import { Client, Room } from "colyseus.js";
// Point this at your server (e.g., ws(s)://host:port)
const SERVER_URL =
  (typeof window !== "undefined" &&
    window.location?.origin?.replace(/^http/, "ws")) ||
  "ws://localhost:2567";
const ROOM_NAME = "tetris"; // your Colyseus room name

// Your net protocol ops
import { Op } from "@inner-mainframe/net-protocol";
// ----------------------------

const BOARD_W = 10;
const BOARD_H = 20;

export default function CanvasGame(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statsRef = useRef<HTMLDivElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const lastHudRef = useRef({ lines: -1 });

  // runtime
  const runningRef = useRef(true);
  const rafRef = useRef(0);
  const tPrevRef = useRef(0);
  const accRef = useRef(0);

  // game state + inputs (singleplayer: local step; multiplayer: server-authoritative)
  const gameRef = useRef<GameState>(createGame(BOARD_W, BOARD_H, 0xC0FFEE));
  const inputsRef = useRef<Inputs>({});

  // multiplayer refs
  const roomRef = useRef<Room | null>(null);
  const myIdRef = useRef<string>("");

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    // Responsive canvas with board's aspect 1:2, scaled to viewport
    function layout() {
      const MARGIN_X = 24;
      const MARGIN_Y = 24;
      const SCALE_MULTIPLIER = 0.85;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const aspect = BOARD_H / BOARD_W; // 2

      const maxByWidth = Math.max(0, vw - MARGIN_X);
      const maxByHeight = Math.max(0, (vh - MARGIN_Y) / aspect);
      let cssW = Math.floor(Math.min(maxByWidth, maxByHeight));
      cssW = Math.floor(cssW * SCALE_MULTIPLIER);
      const cssH = Math.floor(cssW * aspect);

      const DPR = Math.min(2, window.devicePixelRatio || 1);

      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.floor(cssW * DPR);
      canvas.height = Math.floor(cssH * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    function onResize() {
      layout();
      draw(); // immediate refresh so it looks crisp
    }
    window.addEventListener("resize", onResize);
    layout();

    // ---- MULTIPLAYER: connect & wire handlers (only if MODE === "multi") ----
    if (MODE === "multi") {
      const client = new Client(SERVER_URL);
      client
        .joinOrCreate(ROOM_NAME)
        .then((room) => {
          roomRef.current = room;
          myIdRef.current = room.sessionId;

          // Server -> Client messages
          room.onMessage(Op.START, (msg: any) => {
            // Expect: { roundSeed, visibleW, visibleH, hiddenRows, players:[{id, seed}, ...] }
            const me = (msg.players as Array<{ id: string; seed: number }>).find(
              (p) => p.id === myIdRef.current
            );
            const seed = me ? me.seed : ((Math.random() * 0xffffff) | 0);
            gameRef.current = createGame(msg.visibleW, msg.visibleH, seed);
            lastHudRef.current = { lines: -1 };
          });

          // Use your existing SNAPSHOT op for periodic server state
          room.onMessage(Op.SNAPSHOT, (msg: any) => {
            // Minimal example: merge into current state
            // (Adjust to your actual snapshot payload)
            if (msg?.state) {
              gameRef.current = { ...gameRef.current, ...msg.state };
            }
          });
        })
        .catch((err) => {
          console.error("Colyseus connection failed:", err);
        });
    }
    // ------------------------------------------------------------------------

    // Inputs
    function onKey(e: KeyboardEvent, down: boolean) {
      // Pause toggle stays local UI-only
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

      // One-shots
      if (down && !e.repeat) {
        if (e.key === " ") inputsRef.current.hardDrop = true;

        if (e.key === "ArrowUp") inputsRef.current.rotCW = true;
        if (e.key === "q" || e.key === "Q") inputsRef.current.rotCCW = true;
        if (e.key === "e" || e.key === "E") inputsRef.current.rotCW = true;

        // Restart / Ready varies by mode:
        if (e.key === "r" || e.key === "R") {
          if (MODE === "single") {
            // single-player: local reset (same feel as before)
            gameRef.current = createGame(BOARD_W, BOARD_H, (Math.random() * 0xffffff) | 0);
            lastHudRef.current = { lines: -1 };
          } else {
            // multiplayer: tell server you're ready for next round
            const room = roomRef.current;
            if (room) room.send({ op: Op.READY } as any);
          }
          return;
        }
      }

      // Held keys
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

      // In multiplayer, forward input to server
      if (MODE === "multi") {
        const room = roomRef.current;
        if (room) {
          room.send({
            op: Op.INPUT,
            // shape it however your server expects; this is a minimal example
            inputs: {
              left: !!inputsRef.current.left,
              right: !!inputsRef.current.right,
              softDrop: !!inputsRef.current.softDrop,
              rotCW: !!inputsRef.current.rotCW,
              rotCCW: !!inputsRef.current.rotCCW,
              hardDrop: !!inputsRef.current.hardDrop,
            },
          } as any);
        }
      }
    }

    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    // Helpers
    function getCellSize() {
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      return {
        cell: cssW / BOARD_W,
        cssW,
        cssH, // equals cell * BOARD_H by construction
      };
    }

    function drawCell(gx: number, gy: number) {
      const { cell } = getCellSize();
      const x = gx * cell;
      const y = gy * cell;

      // simple coloring
      ctx.fillStyle = "#00ff7f";
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;

      ctx.fillRect(x, y, cell, cell);
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }

    function draw() {
      const { cssW, cssH } = getCellSize();

      const s = gameRef.current;

      // Clear full canvas
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, cssW, cssH);

      // playfield bg (visible area)
      ctx.fillStyle = "#0e1626";
      ctx.fillRect(0, 0, cssW, cssH);

      // Locked cells (skip hidden rows)
      for (let y = HIDDEN_ROWS; y < s.boardH; y++) {
        for (let x = 0; x < s.boardW; x++) {
          if (s.board[y][x]) {
            drawCell(x, y - HIDDEN_ROWS);
          }
        }
      }

      // Active piece (only visible part)
      const p = s.active;
      if (p) {
        const cells = shapeCells(p.type, p.rot);
        for (const [cx, cy] of cells) {
          const gx = p.x + cx;
          const gy = p.y + cy;
          if (gy >= HIDDEN_ROWS && gy < s.boardH) {
            drawCell(gx, gy - HIDDEN_ROWS);
          }
        }
      }

      // outline
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, cssW, cssH);

      // HUD inside canvas

      if (s.gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, cssW, cssH);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 28px ui-sans-serif, system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (MODE === "single") {
          ctx.fillText("GAME OVER", cssW / 2, cssH / 2 - 12);
          ctx.font = "16px ui-sans-serif, system-ui";
          ctx.fillText("Press R to restart", cssW / 2, cssH / 2 + 16);
        } else {
          ctx.fillText("GAME OVER", cssW / 2, cssH / 2 - 12);
          ctx.font = "16px ui-sans-serif, system-ui";
          ctx.fillText("Press R to ready for next round", cssW / 2, cssH / 2 + 16);
        }
      }
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

    // fixed-step loop (single-player advances locally; multi just renders)
    const FIXED_DT = 1 / 60;
    let frames = 0,
      last = performance.now();

    function update(dt: number) {
      if (MODE === "single") {
        step(gameRef.current, inputsRef.current, dt * 1000, DEFAULT_PARAMS);
        // clear one-shots (single-player)
        inputsRef.current.rotCW = false;
        inputsRef.current.rotCCW = false;
        inputsRef.current.hardDrop = false;
        inputsRef.current.respawn = false;
      } else {
        // multiplayer: server authoritative; do not advance locally.
        // Still clear local one-shots so we don't keep spamming INPUT:
        inputsRef.current.rotCW = false;
        inputsRef.current.rotCCW = false;
        inputsRef.current.hardDrop = false;
        inputsRef.current.respawn = false;
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
      draw();
      updateHudOnClearOnly();

      // FPS stat
      frames++;
      if (now - last > 500) {
        const fps = Math.round((frames * 1000) / (now - last));
        frames = 0;
        last = now;
        if (statsRef.current) {
          statsRef.current.textContent = `DPR ${Math.min(2, window.devicePixelRatio || 1)} • ${fps} FPS`;
        }
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
      if (roomRef.current) {
        try {
          roomRef.current.leave();
        } catch {}
        roomRef.current = null;
      }
    };
  }, []);

  // Centered layout with sidebar HUD
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0f1a",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* Canvas column */}
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

        {/* Sidebar HUD */}
        <div
          style={{
            minWidth: 200,
            display: "grid",
            gap: 12,
            color: "#e5e7eb",
            fontFamily: "ui-sans-serif, system-ui",
          }}
        >
          <div
            ref={hudRef}
            style={{
              padding: "12px 14px",
              background: "#0e1626",
              border: "1px solid #1f2937",
              borderRadius: 8,
              fontSize: 16,
            }}
          >
            Score: 0 • Level: 0 • Lines: 0
          </div>

          <div
            style={{
              padding: "10px 12px",
              background: "#0e1626",
              border: "1px solid #1f2937",
              borderRadius: 8,
              fontSize: 13,
              color: "#cbd5e1",
              lineHeight: 1.5,
            }}
          >
            Controls:<br />
            ←/→ move • ↑/Q/E rotate<br />
            ↓ soft drop <br />
            Space hard drop<br />
            {MODE === "single" ? "R restart • " : "R ready • "}
            P pause
          </div>
        </div>
      </div>
    </div>
  );
}
