// dsh-delegate-router — hand-written Typert host manifest for the stats
// sidecar. Consumed by @deepseek-ai/dsh-typert-loader.
import { z } from "zod";
import { listResultSchema } from "./schemas.js";

// dsh 0.2: every strict codec needs a create() factory (memoized, as the
// official typert artifacts do).
let listResultSchema$value;
const listResultSchema$create = () => (listResultSchema$value ??= listResultSchema);

const PACKAGE = "dsh-delegate-router";

export const TYPERT = {
  package: PACKAGE,
  face: "host",
  schemas: [],
  invocations: [
    {
      id: `${PACKAGE}#delegateRouterStats/list`,
      service: "delegateRouterStats",
      namespace: "delegateRouterStats",
      method: "list",
      invocation: { kind: "direct" },
      parameters: [
        {
          name: "request",
          wire: "request",
          source: "json",
          codec: {
            mode: "strict",
            typeSymbol: `${PACKAGE}#ListRequest`,
            create: (() => { let value; return () => (value ??= z.object({ sessionId: z.union([z.string().min(1).max(160), z.null()]) })); })(),
          },
        },
      ],
      result: {
        mode: "strict",
        typeSymbol: `${PACKAGE}#ListResult`,
        create: listResultSchema$create,
      },
      sourceLocation: { file: "lib/stats-service.js", line: 1, column: 1 },
    },
  ],
  model: {
    services: [
      {
        key: "delegateRouterStats",
        exportName: "StatsService",
        tags: [],
        description:
          "Read-only sidecar that exposes the routing ledger (which model each delegated subagent ran with) for the client savings panel.",
        summary: "Routing ledger reader.",
        jsDoc: "/**\n * Read-only routing ledger sidecar.\n */",
        members: [
          {
            kind: "method",
            name: "list",
            signature: "@Remote('list') list(request: ListRequest): ListResult",
          },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
};
