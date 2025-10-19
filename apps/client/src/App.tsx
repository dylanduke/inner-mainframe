// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import CanvasGame from "./game/CanvasGame";
import LocalMultiplayer from "./game/LocalMultiplayer";

import appleFontUrl from "./game/apple-ii.ttf?url";
import {
  createOffscreenCanvas,
  drawWithShaders,
  setupWebglCanvas,
  Color,
} from "@hackvegas-2025/shared";

type Route = "menu" | "single" | "local";

// Simple menu model
type MenuItem = { key: Route; label: string };
const MENU_ITEMS: MenuItem[] = [
  // { key: "single", label: "▶  Single Player" },
  // { key: "local",  label: "⧉  Local Multiplayer" },
  { key: "single", label: "Solo" },
  { key: "local",  label: "Multiplayer" },
];

// What we keep from the renderer to enable hit-testing
type OptionRect = { x: number; y: number; w: number; h: number };

export default function App() {
  const [route, setRoute] = useState<Route>("menu");

  // Load Apple II font so shader text matches game
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
  }, []);

  useEffect(() => {
    if (route === "menu") return; // only listen while in a game screen
  
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setRoute("menu");
      }
    };
  
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [route]);

  // Title text is stable
  const titleText = useMemo(() => "Inner Mainframe", []);

  // Shader + menu state (menu only)
  const shaderRefs = useRef<{
    canvas: HTMLCanvasElement | null;
    raf: number;
    render: (off: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D, canvas: HTMLCanvasElement) => void;
    hoverIndex: number;     // current hovered option (mouse) or focused (keyboard)
    optionRects: OptionRect[];
  }>({
    canvas: null,
    raf: 0,
    render: () => {},
    hoverIndex: 0,
    optionRects: [],
  });

  // Helpers to change route from menu
  const choose = (route: Route) => {
    if (route === "menu") return;
    setRoute(route);
  };

  // Build a renderer that draws the entire MENU plate (title + selectable options)
  function makeMenuRenderer(items: MenuItem[], getHoverIndex: () => number, setRects: (r: OptionRect[]) => void) {
    const APPLE_FONT = "Apple II, ui-sans-serif, system-ui";

    return function renderMenuToOffscreen(
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

      // Background
      ctx.fillStyle = "#0a0f1a";
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);

      // Framed area
      const margin = Math.round(24 * DPR);
      const innerX = margin;
      const innerY = margin;
      const innerW = offscreen.width - margin * 2;
      const innerH = offscreen.height - margin * 2;

      ctx.fillStyle = "#0e1626";
      ctx.fillRect(innerX, innerY, innerW, innerH);

      ctx.strokeStyle = "#00ff7f";
      ctx.lineWidth = Math.max(2, Math.round(2 * DPR));
      ctx.strokeRect(innerX + 0.5, innerY + 0.5, innerW - 1, innerH - 1);

      // Title
      const minDim = Math.min(offscreen.width, offscreen.height);
      const titleSize = Math.max(24, Math.round(minDim * 0.07));

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,255,127,0.45)";
      ctx.shadowBlur = Math.ceil(6 * DPR);
      ctx.fillStyle = "#00ff7f";
      ctx.font = `900 ${titleSize}px ${APPLE_FONT}`;

      const titleY = innerY + Math.round(innerH * 0.22);
      ctx.fillText(titleText, offscreen.width / 2, titleY);

      // Underline accent
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.35;
      const titleW = ctx.measureText(titleText).width;
      const tx = Math.round(offscreen.width / 2);
      ctx.fillRect(tx - Math.ceil(titleW / 2), titleY + Math.ceil(DPR * 1.25), Math.ceil(titleW), Math.ceil(DPR));
      ctx.globalAlpha = 1;

      // Menu options
      const hover = getHoverIndex();
      const baseSize = Math.max(14, Math.round(minDim * 0.03));
      const gap = Math.max(8, Math.round(baseSize * 0.9));
      const panelTop = titleY + Math.round(minDim * 0.20);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const optionRects: OptionRect[] = [];

      items.forEach((item, i) => {
        const isHover = i === hover;

        // Box sizing
        const label = item.label;
        ctx.font = `${isHover ? "900" : "700"} ${baseSize}px ${APPLE_FONT}`;
        const textW = Math.ceil(ctx.measureText(label).width);
        const padX = Math.max(16, Math.round(baseSize * 0.9)) * DPR;
        const padY = Math.max(10, Math.round(baseSize * 0.6)) * DPR;

        const boxW = Math.min(Math.floor(innerW * 0.55), Math.max(Math.round(textW + padX * 2), Math.round(220 * DPR)));
        const boxH = Math.round((baseSize * DPR) + padY * 2);

        const cx = Math.round(offscreen.width / 2);
        const cy = panelTop + i * (boxH + gap * DPR);

        const x = Math.round(cx - boxW / 2);
        const y = Math.round(cy - boxH / 2);

        // Background (hover gets a brighter fill)
        ctx.fillStyle = isHover ? "rgba(0,255,127,0.10)" : "rgba(14,22,38,0.90)";
        ctx.fillRect(x, y, boxW, boxH);

        // Border (glow on hover)
        ctx.shadowColor = isHover ? "rgba(0,255,127,0.65)" : "rgba(0,255,127,0.35)";
        ctx.shadowBlur = Math.ceil((isHover ? 6 : 3) * DPR);
        ctx.strokeStyle = "#00ff7f";
        ctx.lineWidth = Math.max(2, Math.round(2 * DPR));
        ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);
        ctx.shadowBlur = 0;

        // Label
        ctx.fillStyle = "#00ff7f";
        ctx.font = `${isHover ? "900" : "700"} ${baseSize}px ${APPLE_FONT}`;
        ctx.fillText(label, cx, cy);

        // Store rect in CSS pixels for hit-testing: convert from device pixels
        const rectCss: OptionRect = {
          x: x / DPR,
          y: y / DPR,
          w: boxW / DPR,
          h: boxH / DPR,
        };
        optionRects.push(rectCss);
      });

      // Send updated rects back so event handlers can hit-test
      setRects(optionRects);

      // Decorative faint grid to give shaders “stuff” to bend
      ctx.globalAlpha = 0.075;
      ctx.strokeStyle = "#00ff7f";
      ctx.lineWidth = Math.max(1, Math.round(1 * DPR));
      const step = Math.max(16, Math.round(minDim * 0.02));
      for (let x = innerX; x <= innerX + innerW; x += step) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, innerY);
        ctx.lineTo(x + 0.5, innerY + innerH);
        ctx.stroke();
      }
      for (let y = innerY; y <= innerY + innerH; y += step) {
        ctx.beginPath();
        ctx.moveTo(innerX, y + 0.5);
        ctx.lineTo(innerX + innerW, y + 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
  }

  // Mount/unmount shader when we’re on the menu
  useEffect(() => {
    if (route !== "menu") {
      // Teardown
      cancelAnimationFrame(shaderRefs.current.raf || 0);
      try { shaderRefs.current.canvas?.remove(); } catch {}
      shaderRefs.current.canvas = null;
      shaderRefs.current.render = () => {};
      shaderRefs.current.optionRects = [];
      return;
    }

    

    const { offscreenCanvas, offscreenCtx } = createOffscreenCanvas();
    const { canvas, gl, shaderData } = setupWebglCanvas(offscreenCanvas, offscreenCtx);

    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "0",         // it's the only visible layer now
      display: "block",
      cursor: "pointer",   // hint that options are clickable
    } as CSSStyleDeclaration);

    canvas.setAttribute("data-im-shader-root", "menu");
    document.body.appendChild(canvas);
    shaderRefs.current.canvas = canvas;

    // Renderer + layout bridge
    const getHoverIndex = () => shaderRefs.current.hoverIndex;
    const setRects = (r: OptionRect[]) => { shaderRefs.current.optionRects = r; };
    const renderMenu = makeMenuRenderer(MENU_ITEMS, getHoverIndex, setRects);
    shaderRefs.current.render = renderMenu;

    // RAF
    const draw = () => {
      drawWithShaders(gl as any, canvas, shaderData, renderMenu, Color.green, 24);
      shaderRefs.current.raf = requestAnimationFrame(draw);
    };
    shaderRefs.current.raf = requestAnimationFrame(draw);

    // Events (mouse + keyboard)
    const hitTest = (clientX: number, clientY: number) => {
      if (!canvas) return -1;
      // Use bounding rect to convert client -> canvas CSS pixels
      const r = canvas.getBoundingClientRect();
      const x = clientX - r.left;
      const y = clientY - r.top;
      const rects = shaderRefs.current.optionRects;
      for (let i = 0; i < rects.length; i++) {
        const { x: rx, y: ry, w, h } = rects[i];
        if (x >= rx && x <= rx + w && y >= ry && y <= ry + h) {
          return i;
        }
      }
      return -1;
    };

    const onMove = (e: MouseEvent) => {
      const idx = hitTest(e.clientX, e.clientY);
      if (idx !== -1) {
        shaderRefs.current.hoverIndex = idx;
        canvas.style.cursor = "pointer";
      } else {
        canvas.style.cursor = "default";
      }
    };

    const onClick = (e: MouseEvent) => {
      const idx = hitTest(e.clientX, e.clientY);
      if (idx !== -1) {
        choose(MENU_ITEMS[idx].key);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const count = MENU_ITEMS.length;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        shaderRefs.current.hoverIndex = (shaderRefs.current.hoverIndex - 1 + count) % count;
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        shaderRefs.current.hoverIndex = (shaderRefs.current.hoverIndex + 1) % count;
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const idx = shaderRefs.current.hoverIndex ?? 0;
        choose(MENU_ITEMS[idx].key);
      }
    };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);

    const onResize = () => {
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
    };
    window.addEventListener("resize", onResize);
    onResize();

    // Cleanup
    return () => {
      cancelAnimationFrame(shaderRefs.current.raf || 0);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("click", onClick);
      try { canvas.remove(); } catch {}
      shaderRefs.current.canvas = null;
      shaderRefs.current.render = () => {};
      shaderRefs.current.optionRects = [];
    };
  }, [route, titleText]);

  // Render: no DOM header, no DOM menu — only the game pages when selected.
  return (
    <>
      {route === "single" && <CanvasGame />}
      {route === "local" && <LocalMultiplayer />}
    </>
  );
}
