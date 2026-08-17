// dsh-delegate-router — wire zod schemas shared by the host Typert manifest
// and the Remote client contribution.
import { z } from "zod";

/** One routed-delegation ledger record. */
export const decisionSchema = z.object({
  sessionId: z.string().min(1).max(160),
  at: z.number().int().positive(),
  task: z.string().max(300),
  route: z.string().max(120),
  trigger: z.enum(["auto-light", "auto-heavy", "auto-short", "peak", "flash-all", "budget", "manual"]),
});

/**
 * Business result of `list`. Same envelope convention as core Remote
 * services (e.g. messageFeedback): the transport adds its own {ok, value}
 * carrier on top of this, so the client unwraps twice.
 */
export const listResultSchema = z.union([
  z.object({ ok: z.literal(true), value: z.object({ decisions: z.array(decisionSchema) }) }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string().optional() }) }),
]);
