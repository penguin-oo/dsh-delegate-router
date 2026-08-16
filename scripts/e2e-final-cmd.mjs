// Open sidebar, open the test session, run /delegate inside it.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3741";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9344;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "dshsr-final-"));
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
  throw new Error("final: CDP did not come up");
}

try {
  const browser = await connect();
  const page = await browser.newPage();
  await page.goto(DSH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(7000);

  // 1. Open the sidebar.
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "打开侧边栏");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
  await sleep(3000);

  // 2. Find and click the test session row.
  const clicked = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll("[data-session-id], [data-chat-flow-key], a, button")];
    const hit = candidates.find((el) => el.textContent.includes("DeepSeek V4 Flash 官方定价"));
    if (!hit) return null;
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return hit.textContent.replace(/\s+/g, " ").trim().slice(0, 60);
  });
  console.log("session clicked:", clicked ?? "NOT FOUND");
  await sleep(5000);

  // 3. Run /delegate flash-all.
  await page.click("textarea.uV2eYG_input");
  await page.type("textarea.uV2eYG_input", "/delegate flash-all", { delay: 30 });
  await sleep(1500);
  await page.keyboard.press("Enter");
  await sleep(4000);

  const text = await page.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
  const ok = text.includes("set to flash-all");
  console.log("command result:", ok ? "PASS: set to flash-all" : "FAIL: response missing");
  if (!ok) console.log("body tail:", JSON.stringify(text.slice(-300)));
  await browser.close();
} finally {
  edge.kill();
}
