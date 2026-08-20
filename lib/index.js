// dsh-delegate-router — host half: deterministic Flash/Pro routing for
// subagent delegation calls.
//
// Mechanism (same seams the proven dsh-reasoning-settings uses):
//   1. Per-agent tool wrappers: the ordinary `subagent` / `subagent_fork`
//      tools are re-registered on each agent's scoped context with an extended
//      schema (optional per-call provider/model). The wrapper's execute
//      classifies the task (rules over description+prompt), picks a target
//      route when the mode says so, strips routing fields, and delegates to
//      the original body inside an AsyncLocalStorage target context.
//   2. Host-plane correction: `agent/request` waterfall rewrites the child's
//      first request config to the captured target before it goes durable.
//   3. /delegate slash command: session-level mode override (auto | off |
//      flash-all) consulted by the wrapper at call time.
//   4. A storage-domain ledger records every routed delegation for the client
//      savings panel. (Token-cost accounting arrives with the stats phase;
//      the budget cap activates once per-session tokens are readable.)
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { join as joinPath } from "node:path";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { z } from "zod";
import { StatsService } from "./stats-service.js";

export { StatsService };

const TARGET_TOOL_NAMES = ["subagent", "subagent_fork"];
const WRAPPER_MARK = Symbol("dsh-delegate-router.wrapper");

// ── durable ledger ───────────────────────────────────────────────────────────

const decisionSchema = z.object({
  sessionId: z.string().min(1).max(160),
  at: z.number().int().positive(),
  task: z.string().max(300),
  route: z.string().max(120), // "provider/model" the child ran with
  trigger: z.enum(["auto-light", "auto-heavy", "auto-short", "auto-unknown", "peak", "flash-all", "budget", "manual"]),
});

const ledgerRowSchema = z.object({ decisions: z.array(decisionSchema) });

const domainSpec = defineDomain({
  name: "subagent_router",
  version: 0,
  tables: { ledger: domainTable(ledgerRowSchema) },
});

// ── small helpers ────────────────────────────────────────────────────────────

function objectOf(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isSubagent(agent) {
  const header = objectOf(objectOf(agent).session?.header);
  return header.origin === "subagent" || (Number.isSafeInteger(header.delegationDepth) && header.delegationDepth > 0);
}

function taskText(args) {
  const input = objectOf(args);
  const parts = [];
  if (typeof input.description === "string") parts.push(input.description);
  if (typeof input.prompt === "string") parts.push(input.prompt);
  return parts.join(" ").toLowerCase();
}

/**
 * Build matchers from a keyword list. Pure-ASCII keywords become word-boundary
 * regexes (so "list" does not match "specialist"); CJK keywords require at
 * least two characters and stay substring matches.
 */
function keywordMatcher(keywords) {
  return (Array.isArray(keywords) ? keywords : [])
    .map((raw) => {
      const keyword = String(raw ?? "");
      if (keyword.length === 0) return null;
      if (/^[a-zA-Z]+$/.test(keyword)) {
        return { raw: keyword, re: new RegExp(`\\b${keyword}\\b`, "i") };
      }
      // CJK / mixed: require at least 2 chars to keep precision.
      if (keyword.length < 2) return null;
      return { raw: keyword, re: null };
    })
    .filter(Boolean);
}

/** Count how many keywords from the list appear in the task text. */
function keywordScore(text, matchers) {
  let score = 0;
  const lower = text.toLowerCase();
  for (const matcher of matchers) {
    if (matcher.re ? matcher.re.test(text) : lower.includes(matcher.raw.toLowerCase())) score += 1;
  }
  return score;
}

function routeOf(provider, model) {
  if (typeof provider !== "string" || provider.length === 0) return undefined;
  if (typeof model !== "string" || model.length === 0) return undefined;
  return { provider, model };
}

/** DeepSeek peak-pricing windows (Beijing time), off-peak is half price. */
const DEFAULT_PEAK_HOURS = [[9, 12], [14, 18]];

/** Current hour (0-23) in Beijing time, independent of the host timezone. */
function beijingHour(now = new Date()) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  const parsed = Number(hour);
  return Number.isFinite(parsed) ? parsed % 24 : 0;
}

function isPeakHour(hour, windows) {
  return windows.some(
    ([start, end]) => Number.isFinite(start) && Number.isFinite(end) && hour >= start && hour < end,
  );
}

/** Live token spend of one parent session (input + output across turns). */
function sessionTokensOf(agent) {
  const events = agent?.session?.events;
  if (!Array.isArray(events)) return 0;
  let total = 0;
  for (const event of events) {
    if (event?.type !== "assistant/message") continue;
    const usage = event?.data?.usage;
    if (usage === undefined) continue;
    total += Number(usage.inputTokens ?? 0) + Number(usage.outputTokens ?? 0);
  }
  return total;
}

function explicitTargetOf(args) {
  const input = objectOf(args);
  return routeOf(input.provider, input.model);
}

function baseArgs(args) {
  const { provider: _provider, model: _model, ...base } = objectOf(args);
  return base;
}

/**
 * Classify one delegation and return the route the child should run with, or
 * `undefined` when the parent route should be inherited. Rule order:
 * mode gates, then budget, then keyword scoring (dominance-based: heavy wins
 * ties, but a strictly-light task beats a single incidental heavy word), then
 * the short-task heuristic, then peak-hour demotion, then the opt-in
 * unknown-to-flash policy. Everything else inherits the parent model.
 */
function decideRoute({ text, config, sessionTokens, now = new Date() }) {
  if (config.mode === "off") return undefined;
  if (config.mode === "flash-all") {
    const route = routeOf(config.flashProvider, config.flashModel);
    return route === undefined ? undefined : { route, trigger: "flash-all" };
  }
  if (config.budgetCapTokens > 0 && sessionTokens > config.budgetCapTokens) {
    const flash = routeOf(config.flashProvider, config.flashModel);
    if (flash !== undefined) return { route: flash, trigger: "budget" };
  }

  const heavyMatchers = keywordMatcher(config.heavyKeywords);
  const lightMatchers = keywordMatcher(config.lightKeywords);
  const heavyScore = keywordScore(text, heavyMatchers);
  const lightScore = keywordScore(text, lightMatchers);

  const heavy = routeOf(config.proProvider, config.proModel);
  const flash = routeOf(config.flashProvider, config.flashModel);

  // Dominance: heavy only wins when it is not outvoted by light markers.
  if (heavy !== undefined && heavyScore > 0 && heavyScore >= lightScore) {
    return { route: heavy, trigger: "auto-heavy" };
  }
  if (flash !== undefined && lightScore > 0 && lightScore > heavyScore) {
    return { route: flash, trigger: "auto-light" };
  }
  if (flash !== undefined && config.shortTaskMaxChars > 0 && text.length <= config.shortTaskMaxChars) {
    return { route: flash, trigger: "auto-short" };
  }
  if (
    flash !== undefined &&
    config.peakDemoteUnknown === true &&
    isPeakHour(beijingHour(now), config.peakHours)
  ) {
    return { route: flash, trigger: "peak" };
  }
  if (flash !== undefined && config.unknownToFlash === true) {
    return { route: flash, trigger: "auto-unknown" };
  }
  return undefined;
}

// ── plugin body ─────────────────────────────────────────────────────────────

/** Optional user config file: ~/.dsh/dsh-delegate-router.json */
function loadConfigFile() {
  try {
    const home = process.env.DSH_HOME ?? joinPath(process.env.USERPROFILE ?? "", ".dsh");
    const raw = readFileSync(joinPath(home, "dsh-delegate-router.json"), "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export const inject = ["tools", "agents", "commands", "storageDomain"];
export const name = "dsh-delegate-router";
export { decideRoute };

/** Numeric/boolean/list knobs: config-file value wins, patch config is the default. */
const numOr = (a, b) => (Number.isSafeInteger(a) ? a : Number.isSafeInteger(b) ? b : 0);
const boolOr = (a, b) => (typeof a === "boolean" ? a : typeof b === "boolean" ? b : false);
const listOr = (a, b) => (Array.isArray(a) ? a : Array.isArray(b) ? b : []);
const windowsOr = (a, b) => {
  const pick = (value) =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((window) => Array.isArray(window) && window.length === 2 && window.every(Number.isFinite))
      ? value
      : undefined;
  return pick(a) ?? pick(b) ?? DEFAULT_PEAK_HOURS;
};

export function apply(ctx, config = {}) {
  const env = (name) => {
    const value = process.env[name];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  const fileConfig = loadConfigFile();
  const effective = {
    mode: ["auto", "off", "flash-all"].includes(fileConfig.mode ?? config.mode)
      ? (fileConfig.mode ?? config.mode)
      : "auto",
    // `||` on purpose: an empty-string patch value means "unset", so the
    // env/file fallbacks must still run.
    flashProvider:
      config.flashProvider || env("DSH_DELEGATE_ROUTER_FLASH_PROVIDER") || fileConfig.flashProvider || "",
    flashModel:
      config.flashModel || env("DSH_DELEGATE_ROUTER_FLASH_MODEL") || fileConfig.flashModel || "",
    proProvider:
      config.proProvider || env("DSH_DELEGATE_ROUTER_PRO_PROVIDER") || fileConfig.proProvider || "",
    proModel:
      config.proModel || env("DSH_DELEGATE_ROUTER_PRO_MODEL") || fileConfig.proModel || "",
    // DIY knobs: the user config file overrides the shipped patch defaults.
    budgetCapTokens: numOr(fileConfig.budgetCapTokens, config.budgetCapTokens),
    shortTaskMaxChars: numOr(fileConfig.shortTaskMaxChars, config.shortTaskMaxChars),
    peakDemoteUnknown: boolOr(fileConfig.peakDemoteUnknown, config.peakDemoteUnknown),
    unknownToFlash: boolOr(fileConfig.unknownToFlash, config.unknownToFlash),
    peakHours: windowsOr(fileConfig.peakHours, config.peakHours),
    lightKeywords: listOr(fileConfig.lightKeywords, config.lightKeywords),
    heavyKeywords: listOr(fileConfig.heavyKeywords, config.heavyKeywords),
  };

  const targetContext = new AsyncLocalStorage();
  const targetByAgent = new WeakMap();
  const sessionModes = new Map(); // sessionId -> 'auto' | 'off' | 'flash-all'
  let table;
  let decisionTail = Promise.resolve();

  ctx.effect(() => {
    (async () => {
      const domain = await ctx.storageDomain.open(domainSpec);
      table = domain.table("ledger");
      ctx.effect(() => async () => {
        await decisionTail;
        await domain.close();
      }, "subagent-router.domainClose");
    })();
  }, "subagent-router.domain");

  // The stats Remote is mounted as its own host-plane row
  // (`dsh-delegate-router/stats` in cordis.patch.yml): the API gateway
  // resolves Remote receivers with ctx.get on the host plane, which cannot
  // see services nested under this plugin's fiber.


  const record = (sessionId, task, route, trigger) => {
    if (table === undefined || typeof sessionId !== "string") return;
    const write = async () => {
      try {
        const stored = table.get(sessionId);
        const decisions = [...(stored?.decisions ?? [])];
        decisions.push({
          sessionId,
          at: Date.now(),
          task: String(task).slice(0, 300),
          route,
          trigger,
        });
        await table.put(sessionId, { decisions: decisions.slice(-500) });
      } catch {
        /* ledger failures never break delegation */
      }
    };
    decisionTail = decisionTail.then(write, write);
  };

  const modeFor = (agent) => sessionModes.get(agent?.id) ?? effective.mode;

  // ── per-agent tool wrappers ────────────────────────────────────────────────

  const mounted = new Map();
  let syncing = false;

  const wrapDefinition = (original) => {
    if (original === undefined || original[WRAPPER_MARK] === true) return original;
    const wrapper = {
      ...original,
      [WRAPPER_MARK]: true,
      parameters: {
        ...objectOf(original.parameters),
        properties: {
          ...objectOf(objectOf(original.parameters).properties),
          provider: {
            type: "string",
            description:
              "Optional exact LLM Provider id for this child. Supply together with model to force a specific model; omit both to let the automatic router decide (light tasks may run on a cheaper Flash model).",
          },
          model: {
            type: "string",
            description: "Optional exact model id for this child, supplied together with provider.",
          },
        },
      },
      async execute(args, exec) {
        const explicit = explicitTargetOf(args);
        const base = baseArgs(args);
        const parent = exec?.agent;
        if (parent === undefined) return original.execute(base, exec);

        if (explicit !== undefined) {
          record(parent.session?.id, taskText(args), `${explicit.provider}/${explicit.model}`, "manual");
          return targetContext.run({ parent, target: explicit }, () => original.execute(base, exec));
        }

        const decision = decideRoute({
          text: taskText(args),
          config: { ...effective, mode: modeFor(parent) },
          sessionTokens: sessionTokensOf(parent),
        });
        if (decision === undefined) return original.execute(base, exec);
        record(parent.session?.id, taskText(args), `${decision.route.provider}/${decision.route.model}`, decision.trigger);
        return targetContext.run({ parent, target: decision.route }, () => original.execute(base, exec));
      },
    };
    return wrapper;
  };

  const syncAgent = (agent, refresh = false) => {
    if (agent?.ctx?.tools?.register === undefined) return;
    let records = mounted.get(agent);
    if (records === undefined) {
      records = new Map();
      mounted.set(agent, records);
    }
    if (refresh) {
      for (const { dispose } of records.values()) dispose();
      records.clear();
    }
    for (const toolName of TARGET_TOOL_NAMES) {
      const visible = ctx.get("tools")?.get?.(toolName, agent);
      if (visible === undefined || visible[WRAPPER_MARK] === true) continue;
      const definition = wrapDefinition(visible);
      try {
        const dispose = agent.ctx.tools.register(definition);
        records.set(toolName, { original: visible, dispose });
      } catch {
        /* INACTIVE_EFFECT on a just-disposed agent — skip quietly */
      }
    }
  };

  const syncAll = () => {
    if (syncing) return;
    syncing = true;
    try {
      const agents = ctx.get("agents")?.list?.() ?? [];
      for (const agent of agents) syncAgent(agent, true);
    } catch {
      /* a disposed agent's scoped register throws INACTIVE_EFFECT — benign */
    } finally {
      syncing = false;
    }
  };

  ctx.on("agent/created", ({ agent }) => {
    const pending = targetContext.getStore();
    if (pending !== undefined && isSubagent(agent)) {
      const parentId = agent.session?.header?.parentSession;
      if (parentId === pending.parent?.id) targetByAgent.set(agent, pending.target);
    }
    syncAgent(agent);
  });
  ctx.on("agent/disposed", ({ agent }) => {
    const records = mounted.get(agent);
    if (records === undefined) return;
    mounted.delete(agent);
    for (const { dispose } of records.values()) dispose();
  });
  ctx.on("tools/change", syncAll);
  ctx.effect(
    () => () => {
      syncing = true;
      try {
        for (const records of mounted.values()) for (const { dispose } of records.values()) dispose();
        mounted.clear();
      } finally {
        syncing = false;
      }
    },
    "subagent-router.tools",
  );
  syncAll();

  // ── host-plane request correction ──────────────────────────────────────────

  ctx.on("agent/request", async ({ agent }, next) => {
    const proposal = await next();
    if (!isSubagent(agent)) return proposal;
    const session = objectOf(agent).session;
    // A child that already established a durable route keeps it.
    const boundary = Number.isSafeInteger(session?.header?.seedLength) ? session.header.seedLength : 0;
    if (Array.isArray(session?.events)) {
      for (let index = session.events.length - 1; index >= 0; index -= 1) {
        const event = session.events[index];
        if (event?.type !== "request/header" || !Number.isSafeInteger(event.seq) || event.seq < boundary) continue;
        return proposal;
      }
    }
    const target = targetByAgent.get(agent);
    if (target?.provider !== undefined && target?.model !== undefined) {
      return { ...proposal, provider: target.provider, model: target.model };
    }
    return proposal;
  });

  // ── /delegate command ──────────────────────────────────────────────────────

  ctx.commands.register({
    name: "delegate",
    description:
      "Control subagent model routing for this session: /delegate auto | off | flash-all (auto = light tasks go Flash, heavy stay Pro).",
    input: { hint: "auto | off | flash-all" },
    handler({ agent, rawInput }) {
      const mode = String(rawInput ?? "").trim().toLowerCase() || "auto";
      if (!["auto", "off", "flash-all"].includes(mode)) {
        return { kind: "error", text: `delegate: unknown mode "${mode}" — use auto, off, or flash-all.` };
      }
      sessionModes.set(agent.id, mode);
      return { kind: "success", text: `delegate: subagent routing set to ${mode}.` };
    },
  });
}
