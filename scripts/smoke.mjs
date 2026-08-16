// Smoke test for dsh-delegate-router: plugin shape + Typert manifest + Remote
// contribution + a shimmed apply lifecycle check.
import { remoteMethods } from "@deepseek-ai/dsh-typert-protocol";
import { validateTypertManifest } from "@deepseek-ai/dsh-typert-loader";
import { inject, name } from "../lib/index.js";
import { StatsService } from "../lib/stats-service.js";
import { TYPERT } from "../lib/typert.host.js";
import { TYPERT_REMOTE } from "../lib/typert.remote-client.js";

if (name !== "dsh-delegate-router") throw new Error(`unexpected plugin name ${name}`);
const expectedInject = ["tools", "agents", "commands", "storageDomain"];
if (inject.join(",") !== expectedInject.join(",")) throw new Error(`inject mismatch: ${inject.join(",")}`);

const dummy = Object.create(StatsService.prototype);
const methods = remoteMethods(dummy).map((m) => `${m.method}/${m.invocation.kind}`);
if (methods.join(",") !== "list/direct") throw new Error(`Remote markers mismatch: ${methods.join(",")}`);
validateTypertManifest("dsh-delegate-router", TYPERT);
if (TYPERT_REMOTE.descriptors.length !== 1) throw new Error(`expected 1 descriptor, got ${TYPERT_REMOTE.descriptors.length}`);

// Shimmed apply: command registration + no-throw on plugin lifecycle.
const calls = { register: 0, on: 0 };
const ctx = {
  effect() {},
  on() {
    calls.on += 1;
  },
  commands: { register() { calls.register += 1; } },
  storageDomain: { open: async () => ({ table: () => ({ get: () => undefined, put: async () => {} }), close: async () => {} }) },
  get() { return undefined; },
};
const { apply } = await import("../lib/index.js");
apply(ctx, { mode: "auto" });
if (calls.register !== 1) throw new Error("expected one command registration");
console.log("smoke: OK —", name, "| stats:", methods.join(", "));
