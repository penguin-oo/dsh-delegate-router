// Deep probe of the composer structure on 3741.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3741";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "dshsr-probe2-"));
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
  const info = await page.evaluate(() => {
    const composer = document.querySelector("[data-composer-card]");
    return {
      textareas: [...document.querySelectorAll("textarea")].map((el) => ({
        cls: el.className.slice(0, 60),
        ph: el.placeholder,
      })),
      composerHtml: composer?.outerHTML.slice(0, 1500) ?? "none",
      bodyText: document.body.textContent.replace(/\s+/g, " ").trim().slice(0, 200),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
} finally {
  edge.kill();
}
