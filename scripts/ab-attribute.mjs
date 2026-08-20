// A/B attribution: decode recent sessions, show parent linkage, first user
// text, model, and usage for the recent run pair.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { decompress } from "fzstd";

const ROOT = "C:/Users/MECHREVO/.dsh/sessions";
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === "session.jsonl.zstd") files.push(full);
  }
};
walk(ROOT);
files.sort((a, b) => readFileSync(b).length - readFileSync(a).length); // rough

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
        try { events.push(JSON.parse(line)); } catch { /* torn */ }
      }
      offset = buffer.length;
    } catch { offset += 1; }
  }
  return events;
}

const seen = new Set();
for (const file of files) {
  if (seen.has(file)) continue;
  seen.add(file);
  let events;
  try { events = decode(file); } catch { continue; }
  const first = events[0];
  if (first?.type !== "session") continue;
  const created = Number(first.createdAt ?? 0);
  if (created < 1786940000000) continue; // only today's later runs
  const parent = first.parentSession;
  const header = events.find((e) => e?.type === "request/header");
  const model = header?.data?.header?.config?.model ?? header?.data?.config?.model ?? "?";
  const firstUser = events.find((e) => e?.type === "user/message");
  const userText = typeof firstUser?.data?.message?.content === "string"
    ? firstUser.data.message.content
    : JSON.stringify(firstUser?.data?.message?.content ?? "");
  let input = 0, output = 0;
  for (const event of events) {
    if (event?.type !== "assistant/message") continue;
    const usage = event?.data?.usage;
    if (usage === undefined) continue;
    input += Number(usage.inputTokens ?? 0);
    output += Number(usage.outputTokens ?? 0);
  }
  console.log(`--- ${file.replace(/^.*sessions[\\/]/, "")}`);
  console.log(`  created=${new Date(created).toLocaleString()} parent=${parent ?? "(root)"} model=${model} usage in=${input} out=${output} events=${events.length}`);
  console.log(`  firstUser: ${userText.slice(0, 90).replace(/\n/g, " ")}`);
}
