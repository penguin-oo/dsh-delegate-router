// Full loop: new session → light delegation → open panel → verify rows.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3742";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9347;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROMPT = "请派一个子代理帮我搜索一下 V4 Flash 的定价，两句话总结。";

const profile = mkdtempSync(join(tmpdir(), "dshdr-loop-"));
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
  throw new Error("loop: CDP did not come up");
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
  console.log("prompt sent");

  // Wait for the delegation to complete (subagent run settles).
  let done = false;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await sleep(10000);
    const running = await page.evaluate(() => {
      const text = document.body.textContent;
      return /运行中|思考中|Deep diving/.test(text);
    });
    const flow = await page.evaluate(() => document.querySelectorAll("[data-chat-flow-kind]").length);
    console.log(`  t+${(attempt + 1) * 10}s flow=${flow} running=${running}`);
    if (flow >= 6 && !running) {
      done = true;
      break;
    }
  }
  console.log("run settled:", done);

  // Open the ledger panel from the sidebar footer.
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("分派记录"));
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
  await sleep(3000);
  const panel = await page.evaluate(() => document.querySelector(".dshdr_veil")?.textContent.replace(/\s+/g, " ") ?? null);
  const hasFlashRow = panel !== null && panel.includes("轻任务→Flash") && panel.includes("deepseek-v4-flash");
  console.log("panel rows show flash delegation:", hasFlashRow);
  if (panel) console.log("panel text:", panel.slice(0, 260));
  console.log(hasFlashRow ? "LOOP PASS" : "LOOP FAIL");
  await browser.close();
} finally {
  edge.kill();
}
