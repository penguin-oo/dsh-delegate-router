# dsh-delegate-router

> [English](README.md) · [中文](README.zh.md)

**Automatic Flash/Pro routing for DeepSeek Harness subagent calls.**

Your main conversation keeps running on a strong model (e.g. V4 Pro). When the
agent delegates a task to a subagent, this plugin classifies the task and sends
**light tasks to a cheap model (e.g. V4 Flash)** while heavy tasks stay on the
strong model — deterministically, without relying on the model's cooperation.
Every decision is recorded in a ledger you can inspect from the sidebar
(**⚡ 分派记录**).

- **Auto routing** — light tasks run on Flash, heavy tasks stay on Pro.
- **DIY rules** — all rules live in `~/.dsh/dsh-delegate-router.json`:
  keyword lists, the short-task threshold, the budget cap, and the Beijing
  peak-hour demotion.
- **Manual overrides** — per-call `provider`/`model` parameters on the
  `subagent` / `subagent_fork` tools.
- **`/delegate` command** — per-session mode: `/delegate auto | off | flash-all`.
- **Decision ledger** — the ⚡ 分派记录 panel lists every routed delegation
  (task, route, trigger) for the active session.

## Why

DeepSeek V4 Flash costs exactly **one third of V4 Pro on every line** (official
pricing, effective 2026-08-17; peak/off-peak only scales both). Stock DSH runs
every subagent on the **parent's model** — a search task delegated from a Pro
session costs the full Pro rate. Measured on real sessions: 4 routed runs,
~156K tokens, ¥0.32 actual (Flash) vs ¥0.96 hypothetical (Pro) — **66.7%
saved** on every routed task. Run `node scripts/measure-savings.mjs` against
your own `~/.dsh/sessions` to reproduce.

## Rules (in order)

1. explicit per-call `provider`/`model` → used as-is (`manual`)
2. `/delegate off` → inherit; `/delegate flash-all` → all Flash
3. session tokens over `budgetCapTokens` → Flash (`budget`)
4. task text hits `heavyKeywords` → Pro (`auto-heavy`)
5. task text hits `lightKeywords` → Flash (`auto-light`)
6. task text ≤ `shortTaskMaxChars` → Flash (`auto-short`)
7. unmatched + Beijing peak hours (default 9–12, 14–18) → Flash (`peak`)
8. otherwise → inherit the parent model

Task text = the subagent call's `description` + `prompt`, matched
case-insensitively as substrings. Heavy beats light.

## Install

```sh
dsh plugin --profile web add dsh-delegate-router
```

## Configure

All knobs are optional and live in `~/.dsh/dsh-delegate-router.json`:

```json
{
  "flashProvider": "opencode-go",
  "flashModel": "deepseek-v4-flash",
  "proProvider": "opencode-go",
  "proModel": "deepseek-v4-pro",
  "mode": "auto",
  "lightKeywords": ["search", "搜索", "查找", "总结", "summarize", "list", "列出"],
  "heavyKeywords": ["refactor", "重构", "implement", "实现", "debug", "调试"],
  "shortTaskMaxChars": 120,
  "peakDemoteUnknown": true,
  "peakHours": [[9, 12], [14, 18]],
  "budgetCapTokens": 0
}
```

- `shortTaskMaxChars: 0` disables the short-task rule; `peakDemoteUnknown:
  false` disables peak-hour demotion; `budgetCapTokens: 0` disables the cap.
- Providers can also come from `DSH_DELEGATE_ROUTER_FLASH_PROVIDER` /
  `DSH_DELEGATE_ROUTER_FLASH_MODEL` / `DSH_DELEGATE_ROUTER_PRO_PROVIDER` /
  `DSH_DELEGATE_ROUTER_PRO_MODEL` env vars.
- Restart DSH after editing the file. Switch mode at runtime with
  `/delegate <mode>`.

## Development

```sh
npm install
npm run smoke              # manifest sanity
node scripts/test-routing.mjs   # deterministic rule checks
node scripts/measure-savings.mjs # real savings over ~/.dsh/sessions
node scripts/e2e-panel-loop.mjs  # browser E2E against a test instance
```

## License

MIT

## Acknowledgements

Built for the DeepSeek Harness plugin ecosystem — thanks to the community on
[LINUX DO](https://linux.do/) for feedback and testing.
