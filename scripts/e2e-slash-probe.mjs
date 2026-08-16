// Probe: what happens when typing a slash command in the 3741 composer.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3741";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9338;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "dshsr-slash-"));
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
  throw new Error("probe: CDP did not come up");
}

try {
  const browser = await connect();
  const page = await browser.newPage();
  await page.goto(DSH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(6000);
  await page.waitForSelector("textarea.uV2eYG_input", { timeout: 30000 });

  await page.click("textarea.uV2eYG_input");
  await page.type("textarea.uV2eYG_input", "/delegate");
  await sleep(2500);

  const state = await page.evaluate(() => ({
    textareaValue: document.querySelector("textarea.uV2eYG_input")?.value,
    suggestions: [...document.querySelectorAll("[role='option'], [role='listbox'], .uV2eYG_suggest, [data-slot*='command']")].map((el) => el.textContent.trim().slice(0, 60)),
    sendButtons: [...document.querySelectorAll("button")].filter((b) => /发送|send/i.test(b.textContent + (b.getAttribute("aria-label") ?? ""))).map((b) => b.getAttribute("aria-label") ?? b.textContent.trim()),
    bodyTail: document.body.textContent.replace(/\s+/g, " ").slice(-200),
  }));
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
} finally {
  edge.kill();
}
