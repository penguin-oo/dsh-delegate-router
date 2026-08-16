// Check command result text after Enter (body text search).
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3741";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9341;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "dshsr-cmd3-"));
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

try {
  const browser = await connect();
  const page = await browser.newPage();
  await page.goto(DSH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(6000);
  await page.waitForSelector("textarea.uV2eYG_input", { timeout: 30000 });

  for (const cmd of ["/delegate off", "/delegate nonsense", "/delegate flash-all"]) {
    await page.click("textarea.uV2eYG_input");
    await page.type("textarea.uV2eYG_input", cmd, { delay: 30 });
    await sleep(1200);
    await page.keyboard.press("Enter");
    await sleep(3000);
    const hit = await page.evaluate((needle) => {
      const text = document.body.textContent.replace(/\s+/g, " ");
      const index = text.indexOf(needle);
      return index === -1 ? null : text.slice(Math.max(0, index - 120), index + 160);
    }, cmd.slice(1).split(" ")[0] === "delegate" ? "delegate:" : "delegate:");
    console.log(`[${cmd}] =>`, JSON.stringify(hit));
  }
  await browser.close();
} finally {
  edge.kill();
}
