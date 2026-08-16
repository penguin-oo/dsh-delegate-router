// E2E: /delegate via suggestion-accept + send button.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3741";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9339;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "dshsr-cmd2-"));
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

const send = async (page, text) => {
  await page.click("textarea.uV2eYG_input");
  await page.type("textarea.uV2eYG_input", text, { delay: 30 });
  await sleep(1200);
  await page.keyboard.press("Enter"); // accept suggestion (fills the command)
  await sleep(800);
  await page.keyboard.press("Enter"); // send
  await sleep(1000);
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll("button")].map((b) => b.textContent.trim() + (b.getAttribute("aria-label") ? `(${b.getAttribute("aria-label")})` : "")).filter(Boolean).slice(0, 12),
  );
  console.log("composer buttons:", JSON.stringify(buttons));
};

try {
  const browser = await connect();
  const page = await browser.newPage();
  await page.goto(DSH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(6000);
  await page.waitForSelector("textarea.uV2eYG_input", { timeout: 30000 });

  await send(page, "/delegate off");
  await sleep(5000);
  const afterOff = await page.evaluate(() => document.body.textContent.replace(/\s+/g, " ").slice(-400));
  console.log("after /delegate off:", JSON.stringify(afterOff));

  await send(page, "/delegate nonsense");
  await sleep(5000);
  const afterBad = await page.evaluate(() => document.body.textContent.replace(/\s+/g, " ").slice(-400));
  console.log("after /delegate nonsense:", JSON.stringify(afterBad));

  console.log(afterOff.includes("set to off") ? "PASS: off accepted" : "FAIL: off response missing");
  console.log(afterBad.includes("unknown mode") ? "PASS: bad mode rejected" : "FAIL: error response missing");
  await browser.close();
} finally {
  edge.kill();
}
