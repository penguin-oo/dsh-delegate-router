# dsh-subagent-router

> [English](README.md) · [中文](README.zh.md)

**Automatic Flash/Pro routing for DeepSeek Harness subagent calls.**

Your main conversation keeps running on a strong model (e.g. V4 Pro). When the
agent delegates a task to a subagent, this plugin classifies the task and sends
**light tasks to a cheap model (e.g. V4 Flash)** while heavy tasks stay on the
strong model — deterministically, without relying on the model's cooperation.

- **Auto routing** — light tasks (search / summarize / list …) run on Flash;
  heavy tasks (refactor / implement / debug …) stay on Pro.
- **Manual overrides** — per-call `provider`/`model` parameters are added to the
  `subagent` / `subagent_fork` tools, so you can force a model on any call.
- **`/delegate` command** — per-session mode: `/delegate auto | off | flash-all`.
- **Budget cap** — (config ready, token accounting in a later release) once the
  session exceeds `budgetCapTokens`, new subagents downgrade to Flash.
- **Decision ledger** — every routed delegation is recorded (task, chosen
  route, trigger) in a storage domain; a savings panel is planned.

## How it works

The plugin wraps the official `subagent` / `subagent_fork` tools on each agent's
scoped context (same seam the proven `dsh-reasoning-settings` uses), classifies
the task inside the wrapper, and rewrites the child's first request in the
`agent/request` waterfall — the official lifecycle stays untouched. Verified
end-to-end: a "search" delegation ran the child session on
`deepseek-v4-flash` while the parent session stayed on `deepseek-v4-pro`.

## Install

```sh
dsh plugin --profile web add dsh-subagent-router
```

## Configure

Set the Flash/Pro routes either in the profile patch config or via environment
variables (both are optional; the router only acts when the relevant route is
configured):

```sh
setx DSH_SUBAGENT_ROUTER_FLASH_PROVIDER "<provider>"
setx DSH_SUBAGENT_ROUTER_FLASH_MODEL   "<flash-model-id>"
setx DSH_SUBAGENT_ROUTER_PRO_PROVIDER  "<provider>"
setx DSH_SUBAGENT_ROUTER_PRO_MODEL     "<pro-model-id>"
```

Restart DSH afterwards. Modes: `auto` (default), `off`, `flash-all`; switch at
runtime with `/delegate <mode>`.

## Development

```sh
npm install
npm run smoke
node scripts/e2e-delegate.mjs   # browser E2E against a test instance
```

## License

MIT

## Acknowledgements

Built for the DeepSeek Harness plugin ecosystem — thanks to the community on
[LINUX DO](https://linux.do/) for feedback and testing.
