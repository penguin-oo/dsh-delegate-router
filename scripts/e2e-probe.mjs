// E2E: verify dsh-subagent-router routes a light subagent task to Flash.
// Drives the 3741 web UI: new session → send a light-task prompt that asks the
// agent to delegate → wait → report. (The definitive model check happens in
// the host session logs afterwards.)
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = process.env.DSH_URL ?? "http://127.0.0.1:3741";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  const structure = await page.evaluate(() => ({
    composer: document.querySelectorAll("[data-composer-card]").length,
    editable: [...document.querySelectorAll("[contenteditable]")].map((el) => ({
      cls: el.className.slice(0, 60),
      ph: el.getAttribute("placeholder") ?? el.getAttribute("data-placeholder") ?? "",
    })),
    buttons: [...document.querySelectorAll("button")].map((b) => b.textContent.trim().slice(0, 20)).filter(Boolean).slice(0, 15),
  }));
  console.log("structure:", JSON.stringify(structure, null, 2));
  await browser.close();
} finally {
  edge.kill();
}
