// src/game/makeGameRenderer.ts
import type { GameState } from "@inner-mainframe/game-logic";
import { renderTetris2D } from "./render2d";

export function makeGameRenderer(
  gameRef: React.MutableRefObject<GameState>,
  boardW: number,
  boardH: number
) {
  return function renderGameToOffscreen(
    offscreen: OffscreenCanvas,
    offctx: OffscreenCanvasRenderingContext2D,
    webglCanvas: HTMLCanvasElement
  ) {
    // match offscreen size to the WebGL backbuffer size
    // (drawWithShaders already sized the WebGL canvas beforehand)
    if (offscreen.width !== webglCanvas.width || offscreen.height !== webglCanvas.height) {
      offscreen.width = webglCanvas.width;
      offscreen.height = webglCanvas.height;
    }
    // clear + draw
    renderTetris2D(offctx, gameRef.current, offscreen.width, offscreen.height, boardW, boardH);
  };
}
