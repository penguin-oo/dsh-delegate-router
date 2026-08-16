// Refined: click the session row precisely, then /delegate.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3741";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9345;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "dshsr-final2-"));
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
  throw new Error("final2: CDP did not come up");
}

try {
  const browser = await connect();
  const page = await browser.newPage();
  await page.goto(DSH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(7000);

  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "打开侧边栏");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
  await sleep(3000);

  const clicked = await page.evaluate(() => {
    // Find the smallest element (any tag) whose own text contains the title.
    const all = [...document.querySelectorAll("div, a, button, li, span, [role='button']")];
    const hits = all.filter(
      (el) => el.childElementCount === 0 && el.textContent.includes("请查询 DeepSeek V4 Flash 官方定价"),
    );
    if (hits.length === 0) return "no-text-hit";
    const target = hits[0];
    const clickable = target.closest("[data-session-id], a, button, [role='button']") ?? target;
    clickable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return `clicked <${clickable.tagName}> ${clickable.textContent.replace(/\s+/g, " ").trim().slice(0, 50)}`;
  });
  console.log("session click:", clicked);
  await sleep(5000);

  const flow = await page.evaluate(() => document.querySelectorAll("[data-chat-flow-kind]").length);
  console.log("flow after open:", flow);

  await page.click("textarea.uV2eYG_input");
  await page.type("textarea.uV2eYG_input", "/delegate flash-all", { delay: 30 });
  await sleep(1500);
  await page.keyboard.press("Enter");
  await sleep(4000);

  const text = await page.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
  const ok = text.includes("set to flash-all");
  console.log("command result:", ok ? "PASS: set to flash-all" : "FAIL");
  if (!ok) console.log("tail:", JSON.stringify(text.slice(-250)));
  await browser.close();
} finally {
  edge.kill();
}
