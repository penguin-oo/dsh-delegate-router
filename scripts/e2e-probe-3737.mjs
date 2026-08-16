// Probe 3737: dump sidebar session ids, open the "V4 Flash 定价" session,
// click ⚡分派记录, and dump the panel text.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3742";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9347;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "dshdr-probe3737-"));
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
  await page.goto(DSH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(8000);

  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "打开侧边栏");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
  await sleep(6000);

  const rows = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("[data-session-id]")) {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
      out.push({ id: el.getAttribute("data-session-id"), text });
    }
    // Fallback: visible sidebar item texts.
    const texts = [...document.querySelectorAll("div, button, a, li, span")]
      .filter((el) => el.childElementCount === 0 && (el.textContent || "").trim().length > 4 && (el.textContent || "").trim().length < 70)
      .map((el) => el.textContent.trim())
      .filter((text, index, all) => all.indexOf(text) === index)
      .slice(0, 40);
    out.push({ id: null, text: `-- all texts: ${texts.join(" | ")}` });
    return out;
  });
  console.log("session rows:", JSON.stringify(rows, null, 2));

  let clicked = false;
  const candidates = ["flash", "定价", "搜索"];
  for (let attempt = 0; attempt < 3 && !clicked; attempt += 1) {
    if (attempt === 1) {
      // Expand the collapsed session list first.
      await page.evaluate(() => {
        const all = [...document.querySelectorAll("div, a, button, li, span, [role='button']")];
        const expander = all.find((el) => el.childElementCount === 0 && (el.textContent || "").includes("展开其余"));
        expander?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      });
      await sleep(4000);
    }
    clicked = await page.evaluate((candidates) => {
      const all = [...document.querySelectorAll("div, a, button, li, span, [role='button']")];
      for (const needle of candidates) {
        const hit = all.find(
          (el) => el.childElementCount === 0 && (el.textContent || "").toLowerCase().includes(needle),
        );
        if (hit === undefined) continue;
        const clickable = hit.closest("[data-session-id], a, button, [role='button']") ?? hit;
        clickable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return true;
      }
      return false;
    }, candidates);
    if (!clicked) await sleep(4000);
  }
  console.log("session opened:", clicked);
  await sleep(4000);

  // Dump everything visible in the sidebar after expansion.
  const afterExpand = await page.evaluate(() => {
    const texts = [...document.querySelectorAll("div, span, li, a")]
      .filter((el) => el.childElementCount === 0 && (el.textContent || "").trim().length > 0)
      .map((el) => el.textContent.trim())
      .filter((text, index, all) => all.indexOf(text) === index)
      .slice(0, 80);
    return texts;
  });
  console.log("after expand texts:", JSON.stringify(afterExpand, null, 2));

  const toggleFound = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("分派记录"));
    if (!button) return false;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  });
  console.log("toggle found:", toggleFound);
  await sleep(4000);

  const panel = await page.evaluate(() => {
    const veil = document.querySelector(".dshdr_veil");
    const debugEl = [...document.querySelectorAll("div")].find((el) => (el.textContent || "").startsWith("sid="));
    const bootKeys = Object.keys(window).filter((k) => k.startsWith("__") || /DSH|dsh/i.test(k)).slice(0, 30);
    let modulesShape = null;
    try {
      const m = window.__DSH_MODULES__;
      modulesShape = {
        type: typeof m,
        keys: m && (typeof m === "object") ? Object.keys(m).slice(0, 20) : null,
        loaderKeys: typeof window.__ModuleLoader__ === "object" ? Object.keys(window.__ModuleLoader__).slice(0, 20) : null,
      };
    } catch (e) {
      modulesShape = { error: String(e) };
    }
    return {
      found: veil !== null,
      text: veil === null ? "" : veil.textContent.replace(/\s+/g, " ").slice(0, 500),
      debug: debugEl?.textContent ?? null,
      bootKeys,
      modulesShape,
    };
  });
  console.log("panel:", JSON.stringify(panel, null, 2));
  await browser.close();
} finally {
  edge.kill();
}
