// src/game/sfx/index.ts
import clear from "./clear.wav?url";
import drop from "./drop.wav?url";
import end from "./end.wav?url";
import select from "./select.wav?url";
import start from "./start.wav?url";

export type SfxKey = "clear" | "drop" | "end" | "select" | "start";
export const SFX: Record<SfxKey, string> = { clear, drop, end, select, start };
