// Verify the ledger panel: open sidebar → test session → click 分派记录.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3741";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9346;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "dshdr-panel-"));
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
  throw new Error("panel: CDP did not come up");
}

try {
  const browser = await connect();
  const page = await browser.newPage();
  await page.goto(DSH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(7000);

  // Open sidebar, with generous settle time.
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "打开侧边栏");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
  await sleep(6000);

  // Open the test session (has ledger records), with retries.
  let clicked = false;
  for (let attempt = 0; attempt < 3 && !clicked; attempt += 1) {
    clicked = await page.evaluate(() => {
      const all = [...document.querySelectorAll("div, a, button, li, span, [role='button']")];
      const hits = all.filter(
        (el) => el.childElementCount === 0 && el.textContent.includes("请查询 DeepSeek V4 Flash 官方定价"),
      );
      if (hits.length === 0) return false;
      const clickable = hits[0].closest("[data-session-id], a, button, [role='button']") ?? hits[0];
      clickable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    });
    if (!clicked) await sleep(4000);
  }
  console.log("session opened:", clicked);
  await sleep(5000);

  // Click the ledger toggle in the sidebar footer.
  const toggleFound = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("分派记录"));
    if (!button) return false;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  });
  console.log("toggle found:", toggleFound);
  await sleep(3000);

  const panel = await page.evaluate(() => {
    const veil = document.querySelector(".dshdr_veil");
    if (!veil) return null;
    return veil.textContent.replace(/\s+/g, " ").slice(0, 400);
  });
  console.log("panel:", JSON.stringify(panel));
  const pass = panel !== null && panel.includes("轻任务→Flash") && panel.includes("deepseek-v4-flash");
  console.log(pass ? "PANEL PASS" : "PANEL FAIL");
  await browser.close();
} finally {
  edge.kill();
}
