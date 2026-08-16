// Precise slash-command send debugging.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3741";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9340;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "dshsr-dbg-"));
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
  throw new Error("dbg: CDP did not come up");
}

const dump = async (page, label) => {
  const state = await page.evaluate(() => ({
    textarea: document.querySelector("textarea.uV2eYG_input")?.value ?? null,
    flow: document.querySelectorAll("[data-chat-flow-kind]").length,
    activeSuggestion: document.querySelector("[aria-selected='true']")?.textContent?.trim().slice(0, 40) ?? null,
  }));
  console.log(`[${label}]`, JSON.stringify(state));
};

try {
  const browser = await connect();
  const page = await browser.newPage();
  await page.goto(DSH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(6000);
  await page.waitForSelector("textarea.uV2eYG_input", { timeout: 30000 });

  await page.click("textarea.uV2eYG_input");
  await page.type("textarea.uV2eYG_input", "/delegate off", { delay: 30 });
  await sleep(1500);
  await dump(page, "after typing");

  await page.keyboard.press("Enter");
  await sleep(1500);
  await dump(page, "after Enter 1");

  await page.keyboard.press("Enter");
  await sleep(2000);
  await dump(page, "after Enter 2");

  // If still nothing, click the send button by aria-label.
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "发送消息");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
  await sleep(2500);
  await dump(page, "after send click");
  await browser.close();
} finally {
  edge.kill();
}
