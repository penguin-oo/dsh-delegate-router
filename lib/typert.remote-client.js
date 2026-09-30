// dsh-delegate-router — hand-written Typert client Remote contribution.
import { z } from "zod";
import { listResultSchema } from "./schemas.js";

// dsh 0.2: every strict codec needs a create() factory (memoized, as the
// official typert artifacts do).
let listResultSchema$value;
const listResultSchema$create = () => (listResultSchema$value ??= listResultSchema);

const PACKAGE = "dsh-delegate-router";

const TYPERT_REMOTE = {
  package: PACKAGE,
  descriptors: [
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
};

export default TYPERT_REMOTE;
export { TYPERT_REMOTE };
