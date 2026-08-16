// dsh-delegate-router — wire zod schemas shared by the host Typert manifest
// and the Remote client contribution.
import { z } from "zod";

/** One routed-delegation ledger record. */
export const decisionSchema = z.object({
  sessionId: z.string().min(1).max(160),
  at: z.number().int().positive(),
  task: z.string().max(300),
  route: z.string().max(120),
  trigger: z.enum(["auto-light", "auto-heavy", "flash-all", "budget", "manual"]),
});

export const listResultSchema = z.object({ decisions: z.array(decisionSchema) }).describe("listResult");
