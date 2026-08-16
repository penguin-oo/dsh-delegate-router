// Isolate the 3737 routing bug: new session → delegation → child model?
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3742";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9348;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROMPT =
  "请派一个子代理搜索一下 DeepSeek V4 Flash 定价，一句总结。（必须使用 subagent 工具）";

const profile = mkdtempSync(join(tmpdir(), "dshdr-iso-"));
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
  throw new Error("iso: CDP did not come up");
}

try {
  const browser = await connect();
  const page = await browser.newPage();
  await page.goto(DSH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(7000);

  await page.waitForSelector("textarea.uV2eYG_input", { timeout: 30000 });
  await page.click("textarea.uV2eYG_input");
  await page.type("textarea.uV2eYG_input", PROMPT, { delay: 20 });
  await sleep(800);
  await page.keyboard.press("Enter");
  console.log("prompt sent on 3737");

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await sleep(10000);
    const running = await page.evaluate(() => /运行中|思考中|Deep diving/.test(document.body.textContent));
    const flow = await page.evaluate(() => document.querySelectorAll("[data-chat-flow-kind]").length);
    console.log(`  t+${(attempt + 1) * 10}s flow=${flow} running=${running}`);
    if (flow >= 6 && !running) break;
  }
  console.log("run settled; child model check comes next");
  await browser.close();
} finally {
  edge.kill();
}

