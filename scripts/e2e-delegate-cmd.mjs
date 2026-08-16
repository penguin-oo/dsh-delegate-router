// E2E: /delegate command responses in the 3741 instance.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3741";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9337;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "dshsr-cmd-"));
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
  await page.type("textarea.uV2eYG_input", text);
  await sleep(400);
  await page.keyboard.press("Enter");
};

try {
  const browser = await connect();
  const page = await browser.newPage();
  await page.goto(DSH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(6000);
  await page.waitForSelector("textarea.uV2eYG_input", { timeout: 30000 });

  // A new empty composer creates a fresh session on first send.
  await send(page, "/delegate off");
  await sleep(5000);
  const afterOff = await page.evaluate(() => document.body.textContent.replace(/\s+/g, " ").slice(-300));
  console.log("after /delegate off:", JSON.stringify(afterOff));

  await send(page, "/delegate nonsense");
  await sleep(5000);
  const afterBad = await page.evaluate(() => document.body.textContent.replace(/\s+/g, " ").slice(-300));
  console.log("after /delegate nonsense:", JSON.stringify(afterBad));

  const okOff = afterOff.includes("routing set to off");
  const errBad = afterBad.includes("unknown mode");
  console.log(okOff ? "PASS: off accepted" : "FAIL: off not accepted");
  console.log(errBad ? "PASS: bad mode rejected" : "FAIL: bad mode not rejected");
  await browser.close();
} finally {
  edge.kill();
}
