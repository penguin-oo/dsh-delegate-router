// Screenshot an HTML chart file to PNG via headless Edge.
// Usage: node scripts/ab-screenshot.mjs <input.html> <output.png>
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node ab-screenshot.mjs <input.html> <output.png>");
  process.exit(2);
}
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9353;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "dsh-ab-shot-"));
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
  throw new Error("CDP did not come up");
}

try {
  const browser = await connect();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(resolve(input)).href, { waitUntil: "networkidle0", timeout: 30000 });
  await sleep(1500);
  await page.screenshot({ path: resolve(output), fullPage: true });
  console.log(`screenshot: ${output}`);
  await browser.close();
} finally {
  edge.kill();
}
