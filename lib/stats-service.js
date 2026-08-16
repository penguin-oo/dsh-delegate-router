// dsh-delegate-router — stats sidecar: exposes the routing ledger of one
// session to the client savings panel through a Remote service.
import { Service } from "@deepseek-ai/cordis";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { z } from "zod";

const decisionSchema = z.object({
  sessionId: z.string(),
  at: z.number(),
  task: z.string(),
  route: z.string(),
  trigger: z.string(),
});

const ledgerRowSchema = z.object({ decisions: z.array(decisionSchema) });

const domainSpec = defineDomain({
  name: "subagent_router",
  version: 0,
  tables: { ledger: domainTable(ledgerRowSchema) },
});

const EMPTY = Object.freeze({ decisions: Object.freeze([]) });

let StatsService = class StatsService extends TypertRemoteService {
  static inject = ["storageDomain"];

  table;
  admissionOpen = true;

  constructor(ctx) {
    super(ctx, "delegateRouterStats");
  }

  async [Service.init]() {
    const domain = await this.ctx.storageDomain.open(domainSpec);
    this.ctx.effect(
      () => async () => {
        this.admissionOpen = false;
        await domain.close();
      },
      "delegate-router.statsClose",
    );
    this.table = domain.table("ledger");
  }

  /** Routing decisions recorded for one parent session, newest first. */
  list(request) {
    if (!this.admissionOpen || this.table === undefined) return { ok: true, value: EMPTY };
    const sessionId = typeof request?.sessionId === "string" ? request.sessionId : "";
    if (sessionId.length === 0) return { ok: true, value: EMPTY };
    const stored = this.table.get(sessionId);
    const decisions = stored?.decisions ?? [];
    const copied = [...decisions].sort((a, b) => b.at - a.at).map((decision) => ({
      sessionId: decision.sessionId,
      at: decision.at,
      task: decision.task,
      route: decision.route,
      trigger: decision.trigger,
    }));
    return { ok: true, value: Object.freeze({ decisions: Object.freeze(copied) }) };
  }
};

Remote("list")(void 0, {
  private: false,
  static: false,
  name: "list",
  addInitializer(init) {
    init.call(Object.create(StatsService.prototype));
  },
});

export { StatsService, StatsService as default, domainSpec };
