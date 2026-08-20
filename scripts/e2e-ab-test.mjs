// A/B demo: IDENTICAL single user message, no tool naming. Run A = plugin
// auto (server default); run B = server config mode:off (set in
// ~/.dsh/dsh-delegate-router.json before starting the instance) — no extra
// user input on either side.
// Usage: node scripts/e2e-ab-test.mjs <a|b>
// After settlement, the script screenshots the ⚡ 分派记录 panel (run a only)
// and reports; the caller moves chart.html aside between runs.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const DSH_URL = "http://127.0.0.1:3742";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CDP_PORT = 9352;
const MODE = process.argv[2];
if (MODE !== "a" && MODE !== "b") {
  console.error("usage: node e2e-ab-test.mjs <a|b>");
  process.exit(2);
}

const PROMPT = "请帮我完成一个调研并出图：派一个子代理查 DeepSeek 官方旗舰模型 deepseek-v4-pro 与 deepseek-v4-flash 的 API 定价（输入缓存命中/未命中、输出，每百万 tokens 人民币价格），以及 2026 年 8 月 17 日生效的峰谷定价规则（高峰时段定义、闲时是否为半价）。然后根据查到的价格生成一张可视化对比图：柱状图对比两个模型各档价格，区分高峰与闲时，自包含 HTML（内联 CSS/SVG，不依赖网络资源），文件名 chart.html 保存到当前工作区根目录，并在回复里附上数据来源链接。";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), `dsh-ab-${MODE}-`));
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

const clickText = (page, needle) => page.evaluate((needle) => {
  const all = [...document.querySelectorAll("button, div, span, li, [role='button']")];
  const hit = all.find((el) => el.childElementCount === 0 && (el.textContent || "").trim() === needle);
  if (!hit) return false;
  const clickable = hit.closest("button, [role='button']") ?? hit;
  clickable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  return true;
}, needle);

try {
  const browser = await connect();
  const page = await browser.newPage();
  await page.goto(DSH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(8000);

  // Fresh temp profile -> fresh session; use the proven composer selector.
  const composer = "textarea.uV2eYG_input";
  await page.waitForSelector(composer, { timeout: 40000 });
  console.log("composer ready");

  // Identical single user message for both runs. For run B the SERVER config
  // is mode:off (set in ~/.dsh/dsh-delegate-router.json before boot) — no
  // extra input, no /delegate command.
  await page.click(composer);
  await page.type(composer, PROMPT, { delay: 6 });
  await sleep(800);
  await page.keyboard.press("Enter");
  console.log("prompt sent");

  let settled = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(15000);
    const state = await page.evaluate(() => {
      const text = document.body.textContent ?? "";
      const running = /运行中|思考中|Deep diving|正在/.test(text);
      const hasChart = /chart\.html/.test(text);
      return { running, hasChart, tail: text.replace(/\s+/g, " ").slice(-220) };
    });
    console.log(`  t+${(attempt + 1) * 15}s running=${state.running} chart=${state.hasChart}`);
    if (state.hasChart && !state.running) {
      settled = true;
      break;
    }
  }
  console.log(settled ? `AB-${MODE.toUpperCase()} SETTLED` : `AB-${MODE.toUpperCase()} TIMEOUT`);

  // Run A only: screenshot the ⚡ 分派记录 panel (plugin effect evidence).
  if (MODE === "a") {
    const opened = await page.evaluate(() => {
      const button = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("分派记录"));
      if (!button) return false;
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    });
    await sleep(4000);
    if (opened) {
      const shot = await page.evaluate(() => {
        const veil = document.querySelector(".dshdr_veil");
        if (!veil) return null;
        const rect = veil.getBoundingClientRect();
        return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
      });
      if (shot) {
        await page.screenshot({ path: "D:/deepseekhrness/l站图/panel-a.png", clip: shot });
        console.log("panel screenshot saved (panel-a.png)");
      }
    }
  }
  await browser.close();
} finally {
  edge.kill();
}
