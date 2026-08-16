// dsh-delegate-router — stats sidecar: exposes the routing ledger of one
// session to the client ledger panel through a Remote service.
//
// Mounted as its own host-plane row (`dsh-delegate-router/stats` in
// cordis.patch.yml): the API gateway resolves Remote receivers with
// ctx.get on the host plane, so the service must be a top-level row like
// the core message-feedback service, not a nested ctx.plugin child.
//
// The router plugin owns the storage domain; this sidecar reads the
// already-open domain through the shared storageDomain facility (opening
// it a second time would throw `already-open`).
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

  constructor(ctx) {
    super(ctx, "delegateRouterStats");
  }

  /** Routing decisions recorded for one parent session, newest first. */
  list(request) {
    const sessionId = typeof request?.sessionId === "string" ? request.sessionId : "";
    if (sessionId.length === 0) return { ok: true, value: EMPTY };
    try {
      const domain = this.ctx.storageDomain.get(domainSpec.name);
      if (domain === undefined) return { ok: true, value: EMPTY };
      const stored = domain.table("ledger").get(sessionId);
      const copied = [...(stored?.decisions ?? [])]
        .sort((a, b) => b.at - a.at)
        .map((decision) => ({
          sessionId: decision.sessionId,
          at: decision.at,
          task: decision.task,
          route: decision.route,
          trigger: decision.trigger,
        }));
      return { ok: true, value: Object.freeze({ decisions: Object.freeze(copied) }) };
    } catch {
      // A read failure must never break the panel or the gateway.
      return { ok: true, value: EMPTY };
    }
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
