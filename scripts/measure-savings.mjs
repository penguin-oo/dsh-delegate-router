// Measure REAL routing savings: decode every child (subagent) session under
// ~/.dsh/sessions, sum its actual token usage, and price the same tokens on
// DeepSeek V4 Flash (what the router actually used) vs V4 Pro (what the child
// would have inherited without routing).
//
// Official pricing, effective 2026-08-17 (CNY per million tokens, Beijing):
//   peak hours 9-12 & 14-18; off-peak = half price. Pro = 3x Flash on every row.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decompress } from "fzstd";

const ROOT = "C:/Users/MECHREVO/.dsh/sessions";
const PRICE = {
  flash: { input: { peak: 3.0, off: 1.5 }, output: { peak: 9.0, off: 4.5 } },
  pro: { input: { peak: 9.0, off: 4.5 }, output: { peak: 27.0, off: 13.5 } },
};

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === "session.jsonl.zstd") files.push(full);
  }
};
walk(ROOT);

function decode(path) {
  const buffer = readFileSync(path);
  const events = [];
  let offset = 0;
  while (offset < buffer.length - 4) {
    const magic = buffer.readUInt32LE(offset);
    if (magic !== 0xfd2fb528) { offset += 1; continue; }
    try {
      const chunk = decompress(buffer.subarray(offset));
      for (const line of Buffer.from(chunk).toString("utf8").split("\n")) {
        if (line.trim().length === 0) continue;
        try { events.push(JSON.parse(line)); } catch { /* torn boundary */ }
      }
      offset = buffer.length;
    } catch { offset += 1; }
  }
  return events;
}

const beijingHour = (ms) => {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", hour: "2-digit", hour12: false }).format(new Date(ms));
  const parsed = Number(hour);
  return Number.isFinite(parsed) ? parsed % 24 : 0;
};
const isPeak = (hour) => (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);

const children = [];
for (const file of files) {
  let events;
  try { events = decode(file); } catch { continue; }
  const first = events[0];
  const parentId = first?.type === "session" ? first.parentSession : undefined;
  if (typeof parentId !== "string" || parentId.length === 0) continue; // not a child
  const header = events.find((e) => e?.type === "request/header");
  const model = header?.data?.header?.config?.model ?? header?.data?.config?.model ?? "?";
  let input = 0, output = 0, peakTokens = 0, offTokens = 0, turns = 0, created = Number(first.createdAt ?? 0);
  for (const event of events) {
    if (event?.type !== "assistant/message") continue;
    const usage = event?.data?.usage;
    if (usage === undefined) continue;
    const i = Number(usage.inputTokens ?? 0);
    const o = Number(usage.outputTokens ?? 0);
    input += i;
    output += o;
    const time = Number(event.createdAt ?? event.time ?? 0);
    if (time > 0) {
      const tokens = i + o;
      if (isPeak(beijingHour(time))) peakTokens += tokens; else offTokens += tokens;
    }
    turns += 1;
  }
  if (turns === 0 && input + output === 0) continue;
  children.push({ file, parentId, model, input, output, peakTokens, offTokens, turns, created });
}

// Attribute un-timestamped tokens to the tier of the child's first event
// (falling back to off-peak — conservative, never overstates savings).
const childCost = (model, row) => {
  const timed = row.peakTokens + row.offTokens;
  const total = row.input + row.output;
  const untimed = total - timed;
  const peakShare = timed > 0 ? row.peakTokens / total : isPeak(beijingHour(row.created || 0)) ? 1 : 0;
  const price = (kind, tier) => PRICE[model][kind][tier];
  const inputCost = row.input / 1e6 * (price("input", "peak") * peakShare + price("input", "off") * (1 - peakShare));
  const outputCost = row.output / 1e6 * (price("output", "peak") * peakShare + price("output", "off") * (1 - peakShare));
  return inputCost + outputCost;
};

const routed = children.filter((row) => row.model === "deepseek-v4-flash");
const unrouted = children.filter((row) => row.model !== "deepseek-v4-flash");

let totIn = 0, totOut = 0, flashTotal = 0, proTotal = 0;
console.log("routed children (ran deepseek-v4-flash — these were saved):\n");
for (const row of routed) {
  const flash = childCost("flash", row);
  const pro = childCost("pro", row);
  flashTotal += flash;
  proTotal += pro;
  totIn += row.input;
  totOut += row.output;
  console.log(`- parent ${row.parentId.slice(0, 20)} child ${row.file.replace(/^.*[\\/]/, "").slice(0, 8)}`);
  console.log(`    turns=${row.turns} input=${row.input.toLocaleString()} output=${row.output.toLocaleString()} (peak ${row.peakTokens.toLocaleString()} / off ${row.offTokens.toLocaleString()} tok)`);
  console.log(`    flash ¥${flash.toFixed(4)} | same tokens on pro ¥${pro.toFixed(4)} | saved ¥${(pro - flash).toFixed(4)}`);
}
if (unrouted.length > 0) {
  console.log(`\nunrouted children (${unrouted.length}): ${unrouted.map((row) => `${row.model} ${row.input + row.output} tok`).join("; ")}`);
}
console.log(`\nTOTALS across ${routed.length} routed runs:`);
console.log(`  input ${totIn.toLocaleString()} + output ${totOut.toLocaleString()} tokens`);
console.log(`  actual (Flash): ¥${flashTotal.toFixed(4)}`);
console.log(`  if all on Pro:  ¥${proTotal.toFixed(4)}`);
console.log(`  saved: ¥${(proTotal - flashTotal).toFixed(4)} (${((1 - flashTotal / proTotal) * 100).toFixed(1)}%)`);
