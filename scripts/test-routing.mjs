// Deterministic routing-rule checks: light/heavy keywords, the short-task
// heuristic, and the Beijing peak-hour demotion (fake clock).
import { decideRoute } from "../lib/index.js";

const FLASH = { provider: "opencode-go", model: "deepseek-v4-flash" };
const PRO = { provider: "opencode-go", model: "deepseek-v4-pro" };

const base = {
  flashProvider: FLASH.provider,
  flashModel: FLASH.model,
  proProvider: PRO.provider,
  proModel: PRO.model,
  budgetCapTokens: 0,
  shortTaskMaxChars: 0,
  peakDemoteUnknown: false,
  peakHours: [[9, 12], [14, 18]],
  lightKeywords: ["search", "搜索", "总结"],
  heavyKeywords: ["refactor", "重构", "debug"],
  mode: "auto",
};

const at = (hour) => new Date(`2026-08-17T${String(hour).padStart(2, "0")}:30:00+08:00`);
let failures = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// Keywords
check("light keyword", decideRoute({ text: "搜索 deepseek 定价", config: base }), { route: FLASH, trigger: "auto-light" });
check("heavy keyword", decideRoute({ text: "refactor the router", config: base }), { route: PRO, trigger: "auto-heavy" });
check("heavy wins ties", decideRoute({ text: "重构这个搜索模块", config: base }), { route: PRO, trigger: "auto-heavy" });
check("no match inherits", decideRoute({ text: "帮我检查一下这个 bug", config: base }), undefined);

// Dominance scoring: strictly-light task beats one incidental heavy word.
check("light beats incidental heavy", decideRoute({ text: "搜索并总结这个重构方案的要点", config: base }), { route: FLASH, trigger: "auto-light" });
check("heavy still wins when equal", decideRoute({ text: "重构并搜索", config: base }), { route: PRO, trigger: "auto-heavy" });

// Word-boundary precision (English)
check("specialist is not list", decideRoute({ text: "review the specialist article", config: { ...base, lightKeywords: ["list"], heavyKeywords: [] } }), undefined);
check("list word matches", decideRoute({ text: "list the files", config: { ...base, lightKeywords: ["list"], heavyKeywords: [] } }), { route: FLASH, trigger: "auto-light" });
check("designer is not design", decideRoute({ text: "the designer made it", config: { ...base, lightKeywords: [], heavyKeywords: ["design"] } }), undefined);

// CJK precision: single-char keywords are dropped.
check("single-char CJK keyword ignored", decideRoute({ text: "银行开户", config: { ...base, lightKeywords: ["行"], heavyKeywords: [] } }), undefined);

// Short-task heuristic
check("short task at any hour", decideRoute({ text: "git status", config: { ...base, shortTaskMaxChars: 80 } }), { route: FLASH, trigger: "auto-short" });
check("long task not short", decideRoute({ text: "x".repeat(200), config: { ...base, shortTaskMaxChars: 80 } }), undefined);
check("short but heavy stays pro", decideRoute({ text: "debug", config: { ...base, shortTaskMaxChars: 80 } }), { route: PRO, trigger: "auto-heavy" });

// Peak-hour demotion (Beijing clock)
check("unknown at peak 10:00 demoted", decideRoute({ text: "帮我检查一下这个 bug", config: { ...base, peakDemoteUnknown: true }, now: at(10) }), { route: FLASH, trigger: "peak" });
check("unknown at off-peak 22:00 inherits", decideRoute({ text: "帮我检查一下这个 bug", config: { ...base, peakDemoteUnknown: true }, now: at(22) }), undefined);
check("peak boundary 12:00 is off-peak", decideRoute({ text: "帮我检查一下这个 bug", config: { ...base, peakDemoteUnknown: true }, now: at(12) }), undefined);
check("peak off unless enabled", decideRoute({ text: "帮我检查一下这个 bug", config: base, now: at(10) }), undefined);
check("light still light at peak", decideRoute({ text: "搜索定价", config: { ...base, peakDemoteUnknown: true }, now: at(10) }), { route: FLASH, trigger: "auto-light" });

// Opt-in unknown-to-flash
check("unknownToFlash routes unmatched", decideRoute({ text: "帮我检查一下这个 bug", config: { ...base, unknownToFlash: true } }), { route: FLASH, trigger: "auto-unknown" });
check("unknownToFlash off inherits", decideRoute({ text: "帮我检查一下这个 bug", config: base }), undefined);

// Mode gates
check("off disables", decideRoute({ text: "搜索定价", config: { ...base, mode: "off" } }), undefined);
check("flash-all wins", decideRoute({ text: "refactor everything", config: { ...base, mode: "flash-all" } }), { route: FLASH, trigger: "flash-all" });
check("budget caps before keywords", decideRoute({ text: "搜索定价", config: { ...base, budgetCapTokens: 1000 }, sessionTokens: 2000 }), { route: FLASH, trigger: "budget" });

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nrouting rules: all checks passed");
