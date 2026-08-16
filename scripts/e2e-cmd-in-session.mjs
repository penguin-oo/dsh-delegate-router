// Run /delegate inside the existing test session on 3741.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3741";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9342;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "dshsr-cmd4-"));
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
  await sleep(7000);

  // Open the existing test session from the sidebar.
  const opened = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll("a, [role='button']")];
    const hit = anchors.find((el) => el.textContent.includes("DeepSeek V4 Flash 官方定价"));
    if (!hit) return null;
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return hit.textContent.trim().slice(0, 60);
  });
  console.log("session link:", opened ?? "NOT FOUND");
  await sleep(5000);

  const flowBefore = await page.evaluate(() => document.querySelectorAll("[data-chat-flow-kind]").length);
  console.log("flow items after open:", flowBefore);

  await page.click("textarea.uV2eYG_input");
  await page.type("textarea.uV2eYG_input", "/delegate flash-all", { delay: 30 });
  await sleep(1500);
  await page.keyboard.press("Enter");
  await sleep(4000);

  const text = await page.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
  const hit = text.includes("set to flash-all") ? "delegate: subagent routing set to flash-all" : null;
  console.log("command result:", JSON.stringify(hit));
  console.log("flow after:", await page.evaluate(() => document.querySelectorAll("[data-chat-flow-kind]").length));
  await browser.close();
} finally {
  edge.kill();
}
