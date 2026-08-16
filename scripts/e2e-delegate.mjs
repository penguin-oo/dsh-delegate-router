// E2E: send a light-task prompt that asks for subagent delegation, wait for
// the run, then dump evidence (host ledger + newest session files).
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3741";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9336;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROMPT =
  "请派一个子代理帮我搜索一下 DeepSeek V4 Flash 的官方定价信息，用三句话总结。";

const profile = mkdtempSync(join(tmpdir(), "dshsr-e2e-"));
const edge = spawn(EDGE, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profile}`,
  "--headless=new",
  "about:blank",
], { stdio: "ignore" });

async function connect() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      await response.json();
      return puppeteer.connect({ browserURL: `http://127.0.0.1:${CDP_PORT}` });
    } catch {
      await sleep(500);
    }
  }
  throw new Error("e2e: Edge CDP did not come up");
}

try {
  const browser = await connect();
  const page = await browser.newPage();
  await page.goto(DSH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(6000);

  await page.waitForSelector("textarea.uV2eYG_input", { timeout: 30000 });
  await page.type("textarea.uV2eYG_input", PROMPT);
  await sleep(500);
  await page.keyboard.press("Enter");
  console.log("e2e: prompt sent, waiting for the run…");

  // Wait for the assistant to finish (stop button disappears / flow settles).
  let settled = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(10000);
    const state = await page.evaluate(() => ({
      flowItems: document.querySelectorAll("[data-chat-flow-kind]").length,
      running: document.body.textContent.includes("停止") || document.body.textContent.includes("思考中"),
      text: document.body.textContent.slice(-400),
    }));
    console.log(`  t+${(attempt + 1) * 10}s flow=${state.flowItems} running=${state.running}`);
    if (state.flowItems > 0 && !state.running) {
      settled = true;
      break;
    }
  }
  console.log(settled ? "e2e: run settled" : "e2e: timed out waiting for settlement");
  const tail = await page.evaluate(() => document.body.textContent.replace(/\s+/g, " ").trim().slice(-600));
  console.log("tail:", tail);
  await browser.close();
} finally {
  edge.kill();
}
