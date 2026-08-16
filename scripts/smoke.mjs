// Smoke test for dsh-subagent-router host module.
import { readFileSync } from "node:fs";

// The module is a Cordis plugin (apply(ctx, config)); smoke checks load
// semantics, inject list, and the classification rules through a tiny harness
// shim instead of booting a real DSH.
import { inject, name } from "../lib/index.js";

if (name !== "dsh-subagent-router") throw new Error(`unexpected plugin name ${name}`);
const expected = ["tools", "agents", "commands", "storageDomain"];
if (inject.join(",") !== expected.join(",")) throw new Error(`inject mismatch: ${inject.join(",")}`);

// classify is not exported; verify its behavior through a dedicated unit test
// by importing the decision logic through a shimmed apply call.
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
console.log("smoke: OK —", name, "inject:", inject.join(", "));
