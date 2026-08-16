// Decode recent session logs and extract request/header model evidence.
// Session files live at sessions/<workspace>/<sessionId>/session.jsonl.zstd.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { decompress } from "fzstd";

const root = "C:/Users/MECHREVO/.dsh/sessions";
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name === "session.jsonl.zstd") files.push(full);
  }
};
walk(root);
files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

for (const file of files.slice(0, 8)) {
  const buffer = readFileSync(file);
  const events = [];
  let offset = 0;
  while (offset < buffer.length - 4) {
    const magic = buffer.readUInt32LE(offset);
    if (magic !== 0xfd2fb528) {
      offset += 1;
      continue;
    }
    try {
      const chunk = decompress(buffer.subarray(offset));
      for (const line of Buffer.from(chunk).toString("utf8").split("\n")) {
        if (line.trim().length === 0) continue;
        try {
          events.push(JSON.parse(line));
        } catch {
          /* torn record boundary — ignore */
        }
      }
      offset = buffer.length;
    } catch {
      offset += 1;
    }
  }
  const headers = events.filter((event) => event?.type === "request/header");
  const firstUser = events.find((event) => event?.type === "user/message");
  const created = events.find((event) => event?.type === "session/created");
  const parentId = headers[0]?.data?.parentSessionId ?? created?.data?.parentSessionId;
  console.log(`\n== ${file} (${events.length} events${parentId ? `, parent=${parentId.slice(0, 12)}` : ""}) ==`);
  const origin = events.find((event) => event?.type === "session/created")?.data?.origin;
  console.log("  origin:", origin ?? "?");
  console.log("  firstUser:", JSON.stringify(firstUser?.data?.message?.content ?? "").slice(0, 90));
  for (const header of headers.slice(0, 2)) {
    const config = header.data?.header?.config ?? header.data?.config;
    console.log("  request/header model:", JSON.stringify({ provider: config?.provider, model: config?.model }));
  }
}
