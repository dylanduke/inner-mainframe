// packages/net-protocol/src/index.ts
import { z } from "zod";

export const Op = {
  JOIN: 1,
  INPUT: 2,
  SNAPSHOT: 3,
  STATE_ACK: 4,
  READY: 5,   // client -> server: "I'm ready for next round"
  START: 6,   // server -> clients: "Start/reset round"
} as const;

export const InputType = z.enum([
  "Left","Right","SoftDrop","HardDrop","RotateCW","RotateCCW","Hold","None"
]);
export type InputType = z.infer<typeof InputType>;

export const ClientInput = z.object({
  op: z.literal(Op.INPUT),
  seq: z.number().int().nonnegative(),
  at: z.number().int(),
  actions: z.array(InputType),
});
export type ClientInput = z.infer<typeof ClientInput>;

export const JoinPayload = z.object({
  op: z.literal(Op.JOIN),
  name: z.string().min(1).max(16),
});
export type JoinPayload = z.infer<typeof JoinPayload>;

// NEW: ready + start payloads
export const ReadyMsg = z.object({ op: z.literal(Op.READY) });
export type ReadyMsg = z.infer<typeof ReadyMsg>;

export const StartMsg = z.object({
  op: z.literal(Op.START),
  roundSeed: z.number().int(),
  visibleW: z.number().int(),
  visibleH: z.number().int(),
  hiddenRows: z.number().int(),
  players: z.array(z.object({ id: z.string(), seed: z.number().int() })),
});
export type StartMsg = z.infer<typeof StartMsg>;
