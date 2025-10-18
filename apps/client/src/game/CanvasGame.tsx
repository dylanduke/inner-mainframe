import React, { useEffect, useRef, type JSX } from "react";
import { TILE, SHAPES, rotateCells, normalize, shapeBounds } from "./shapes"; // ← adjust path if needed
import type { ShapeKey } from "./shapes";
import { green } from "@mui/material/colors";

const LOGICAL_W = 500; // width in CSS pixels
const LOGICAL_H = 750; // height in CSS pixels

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  type: ShapeKey,
  x: number,
  y: number,
  rot = 0,
) {
  const base = SHAPES[type];
  const cells = normalize(rotateCells(base, rot));
  ctx.fillStyle = "#00ff7f";
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;

  for (const [cx, cy] of cells) {
    const px = x + cx * TILE;
    const py = y + cy * TILE;
    ctx.fillRect(px, py, TILE, TILE);
    // inset stroke so it looks crisp on DPR>1
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  }
}

export default function CanvasGame(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statsRef = useRef<HTMLDivElement | null>(null);

  // runtime state
  const runningRef = useRef(true);
  const rafRef = useRef<number>(0);
  const tPrevRef = useRef<number>(0);
  const accRef = useRef(0);
  const inputRef = useRef({
    left: false,
    right: false,
    up: false,
    down: false,
  });

  const world = useRef({
    width: LOGICAL_W,
    height: LOGICAL_H,
    bg: "#0b1220",
  }).current;

  // player starts as L piece (per request)
  const playerRef = useRef({
    type: "L" as ShapeKey,
    x: 60,
    y: 60,
    rot: 0,
    speed: 220,
    color: green,
  });

  type Entity = {
    type: ShapeKey;
    x: number;
    y: number;
    rot: number;
    color?: string;
  };
  const entitiesRef = useRef<Entity[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    const DPR = Math.min(2, window.devicePixelRatio || 1);

    // Set fixed CSS size + scale backing store by DPR for crispness
    canvas.style.width = `${LOGICAL_W}px`;
    canvas.style.height = `${LOGICAL_H}px`;
    canvas.width = Math.floor(LOGICAL_W * DPR);
    canvas.height = Math.floor(LOGICAL_H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // seed a small “bank” row of shapes for reference
    if (entitiesRef.current.length === 0) {
      const order: ShapeKey[] = ["I", "O", "L", "J", "Z", "S", "T"];
      let ox = 16;
      for (const t of order) {
        entitiesRef.current.push({ type: t, x: ox, y: 16, rot: 0 });
        ox += 5 * TILE;
      }
    }

    // helper: rotate player and re-clamp to bounds
    function rotatePlayer(dir: 1 | -1) {
      const p = playerRef.current;
      p.rot = (((p.rot + dir) % 4) + 4) % 4;
      const b = shapeBounds(p.type, p.rot);
      p.x = clamp(p.x, 0, world.width - b.w);
      p.y = clamp(p.y, 0, world.height - b.h);
    }

    // input handling
    function onKey(e: KeyboardEvent, down: boolean) {
      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          inputRef.current.left = down;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          inputRef.current.right = down;
          break;
        case "ArrowUp":
        case "w":
        case "W":
          inputRef.current.up = down;
          if (down && !e.repeat) rotatePlayer(+1);
          break;
        case "ArrowDown":
        case "s":
        case "S":
          inputRef.current.down = down;
          break;
        case "q":
        case "Q":
          if (down && !e.repeat) rotatePlayer(-1);
          break;
        case "e":
        case "E":
          if (down && !e.repeat) rotatePlayer(+1);
          break;
        case "p":
        case "P":
          if (down) {
            runningRef.current = !runningRef.current;
            if (runningRef.current) {
              // reset timing on resume
              tPrevRef.current = performance.now();
              accRef.current = 0;
              loop();
            } else {
              cancelAnimationFrame(rafRef.current);
            }
          }
          break;
      }
    }
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    // fixed-step update
    const FIXED_DT = 1 / 60;

    function update(dt: number) {
      const p = playerRef.current;
      const ip = inputRef.current;
      const b = shapeBounds(p.type, p.rot);

      const ax = (ip.right ? 1 : 0) - (ip.left ? 1 : 0);
      const ay = (ip.down ? 1 : 0) - (ip.up ? 1 : 0);

      p.x += ax * p.speed * dt;
      p.y += ay * p.speed * dt;

      // keep player inside canvas considering current rotation footprint
      p.x = clamp(p.x, 0, world.width - b.w);
      p.y = clamp(p.y, 0, world.height - b.h);
    }

    function draw() {
      const { width: W, height: H, bg } = world;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // reference shapes
      for (const e of entitiesRef.current) {
        drawShape(ctx, e.type, e.x | 0, e.y | 0, e.rot, e.color);
      }

      // player
      const p = playerRef.current;
      drawShape(ctx, p.type, p.x | 0, p.y | 0, p.rot, p.color);

      // HUD
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "16px ui-sans-serif, system-ui, -apple-system, Segoe UI";
      ctx.fillText(
        "Move: WASD/Arrows  •  Rotate: Q/E or ↑  •  P: Pause",
        12,
        22,
      );
    }

    // simple FPS meter
    let frames = 0;
    let last = performance.now();
    function updateStats(now: number) {
      frames++;
      if (now - last > 500) {
        const fps = Math.round((frames * 1000) / (now - last));
        frames = 0;
        last = now;
        if (statsRef.current) {
          statsRef.current.textContent = `${LOGICAL_W}×${LOGICAL_H} (backing ${canvas.width}×${canvas.height}) • DPR ${Math.min(2, window.devicePixelRatio || 1)} • ${fps} FPS`;
        }
      }
    }

    function loop() {
      if (!runningRef.current) return;
      const tNow = performance.now();
      let dt = (tNow - tPrevRef.current) / 1000;
      tPrevRef.current = tNow;

      accRef.current += dt;
      while (accRef.current >= FIXED_DT) {
        update(FIXED_DT);
        accRef.current -= FIXED_DT;
      }
      draw();
      updateStats(tNow);
      rafRef.current = requestAnimationFrame(loop);
    }

    // initialize timing and start
    tPrevRef.current = performance.now();
    accRef.current = 0;
    loop();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [world]);

  // replace your return with this
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#0a0f1a", // optional
      }}
    >
      <div className="stage" style={{ display: "grid", gap: 8 }}>
        <canvas ref={canvasRef} />
        <div
          className="stats"
          ref={statsRef}
          style={{
            color: "#cbd5e1",
            fontFamily: "ui-sans-serif, system-ui",
            fontSize: 12,
            textAlign: "center",
          }}
        />
      </div>
    </div>
  );
}
