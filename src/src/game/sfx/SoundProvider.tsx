// src/game/sfx/SoundProvider.tsx
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SFX } from "./index";

export type SfxKey = keyof typeof SFX;

type PlayOpts = {
  volume?: number; // 0..1
  rate?: number;   // 0.5..2
};

type SoundApi = {
  play: (key: SfxKey, opts?: PlayOpts) => void;
  setMuted: (m: boolean) => void;
  toggleMuted: () => void;
  setMasterVolume: (v: number) => void;
  muted: boolean;
  masterVolume: number;
};

const SoundContext = createContext<SoundApi | null>(null);

// Simple pool so multiple same SFX can overlap without being cut off
function makePool(url: string, size = 6): HTMLAudioElement[] {
  return Array.from({ length: size }, () => {
    const a = new Audio(url);
    a.preload = "auto";
    return a;
  });
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [muted, setMutedState] = useState(false);
  const [masterVolume, setMasterVolume] = useState(0.8);

  const poolsRef = useRef<Record<string, { list: HTMLAudioElement[]; idx: number }>>({});

  // Build pools once
  useEffect(() => {
    const pools: Record<string, { list: HTMLAudioElement[]; idx: number }> = {};
    for (const url of Object.values(SFX)) {
      pools[url] = { list: makePool(url, 8), idx: 0 };
    }
    poolsRef.current = pools;
  }, []);

  // Keep volumes/muted in sync
  useEffect(() => {
    for (const { list } of Object.values(poolsRef.current)) {
      for (const a of list) {
        a.muted = muted;
        a.volume = masterVolume;
      }
    }
  }, [muted, masterVolume]);

  const setMuted = useCallback((m: boolean) => setMutedState(m), []);
  const toggleMuted = useCallback(() => setMutedState((m) => !m), []);

  const play = useCallback(
    (key: SfxKey, opts?: PlayOpts) => {
      const url = SFX[key];
      const pool = poolsRef.current[url];
      if (!pool) return;

      const a = pool.list[pool.idx];
      pool.idx = (pool.idx + 1) % pool.list.length;

      // If it’s still playing, clone for guaranteed overlap
      const node = a.paused ? a : (a.cloneNode(true) as HTMLAudioElement);

      node.muted = muted;
      node.volume = Math.max(0, Math.min(1, (opts?.volume ?? 1) * masterVolume));
      node.playbackRate = opts?.rate ?? 1;

      node.currentTime = 0;
      void node.play().catch(() => {
        // Likely blocked until first user gesture; once user interacts, future plays will work.
      });
    },
    [muted, masterVolume]
  );

  const api = useMemo<SoundApi>(
    () => ({ play, setMuted, toggleMuted, setMasterVolume, muted, masterVolume }),
    [play, setMuted, toggleMuted, setMasterVolume, muted, masterVolume]
  );

  return <SoundContext.Provider value={api}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const ctx = React.useContext(SoundContext);
  if (!ctx) throw new Error("useSound must be used within <SoundProvider>");
  return ctx;
}
