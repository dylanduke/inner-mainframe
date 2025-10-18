import { z } from "zod";
export const Op = { JOIN: 1, INPUT: 2, SNAPSHOT: 3, STATE_ACK: 4 } as const;
export const InputType = z.enum(["Left","Right","SoftDrop","HardDrop","RotateCW","RotateCCW","Hold","None"]);
export type InputType = z.infer<typeof InputType>;
export const ClientInput = z.object({
  op: z.literal(Op.INPUT), seq: z.number().int().nonnegative(),
  at: z.number().int(), actions: z.array(InputType),
});
export type ClientInput = z.infer<typeof ClientInput>;
export const JoinPayload = z.object({
  op: z.literal(Op.JOIN), name: z.string().min(1).max(16),
});
export type JoinPayload = z.infer<typeof JoinPayload>;
