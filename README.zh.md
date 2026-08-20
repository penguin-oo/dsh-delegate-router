# dsh-delegate-router

> [中文](README.zh.md) · [English](README.md)

**给 DeepSeek Harness 的子代理调用做 Flash/Pro 自动分派。**

主对话保持跑强模型（如 V4 Pro）；当 agent 派子代理干活时，本插件对任务做
复杂度分类：**轻任务自动用便宜模型（如 V4 Flash）**，重任务留在强模型——
确定性分派，不靠模型自觉。每次决策都记入账本，侧边栏点 **⚡ 分派记录**
随时可查。

- **自动路由** — 轻任务走 Flash、重任务留 Pro
- **规则可 DIY** — 全部规则在 `~/.dsh/dsh-delegate-router.json`：
  关键词表、短任务阈值、预算上限、北京时间峰谷降级
- **手动覆盖** — `subagent`/`subagent_fork` 工具新增 per-call
  `provider`/`model` 参数，任何一次调用都可强制指定模型
- **`/delegate` 命令** — 会话级模式切换：`/delegate auto | off | flash-all`
- **决策账本** — ⚡ 分派记录面板列出当前会话每一次分派（任务、目标模型、
  触发原因）

## 为什么做这个

DeepSeek V4 Flash 每一档价格都**恰好是 V4 Pro 的三分之一**（2026-08-17
生效的官方定价；峰谷只是整体缩放，比例不变）。而 DSH 原生的子代理
**默认继承父模型**——Pro 会话里派一个搜索任务也要按 Pro 计价。用真实会话
实测：4 次已路由的子代理，共 ~156K tokens，实际花费 ¥0.32（Flash），
同样的量全走 Pro 要 ¥0.96 ——**每次分派省 66.7%**。在你自己机器上跑
`node scripts/measure-savings.mjs` 即可复现。

## 判定规则（按顺序）

1. 调用显式指定 `provider`/`model` → 直接用（`manual`）
2. `/delegate off` → 继承；`/delegate flash-all` → 全走 Flash
3. 会话累计 token 超过 `budgetCapTokens` → Flash（`budget`）
4. 关键词**权重计分**：重词打平获胜，但「明显偏轻」的任务能压过个别意外重词
5. 任务文本长度 ≤ `shortTaskMaxChars` → Flash（`auto-short`）
6. 未命中任何规则 + 北京时间高峰段（默认 9–12、14–18）→ Flash（`peak`）
7. 未命中 + `unknownToFlash: true`（可选项、激进）→ Flash（`auto-unknown`）
8. 其余 → 继承父模型

任务文本 = 子代理调用的 `description` + `prompt`。匹配是精确的：纯英文字母
关键词按**词边界**匹配（`list` 永远不会误中 `specialist`、`design` 不会误中
`designer`）；少于两个字符的中文关键词会被忽略。

## 与 dsh-routing-suite 是绝配

[dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite) 负责
**思维模式/人格层**；本插件负责**子代理模型成本层**。两者叠加：轻任务子代理
被本插件送到 Flash，然后在路由预设的 flash 专属人格下运行。routing-suite
自己的实验（P11/P24）证明最优 weak 人格是 **flash 专属**的、且 spec 式人格在
Flash 上反而有害——所以「Flash + 该路由预设」是廉价派发的最佳组合，而本插件
就是为它提供自动 Flash 分流的那个齿轮。

## 诚实的测量口径

相对价格由官方价目表保证（每档 Flash = Pro 的 1/3，2026-08-17 峰谷定价）。
绝对金额取决于一次运行干了多少活——LLM 运行不确定，所以请比较**单价**
（或同任务），不要比原始总额。`scripts/measure-savings.mjs` 用官方价格表对
你的真实会话日志计价，引用数字前先读它的口径。

## 安装

```sh
dsh plugin --profile web add dsh-delegate-router
```

## 配置

所有配置项均可选，写在 `~/.dsh/dsh-delegate-router.json`：

```json
{
  "flashProvider": "opencode-go",
  "flashModel": "deepseek-v4-flash",
  "proProvider": "opencode-go",
  "proModel": "deepseek-v4-pro",
  "mode": "auto",
  "lightKeywords": ["search", "搜索", "查找", "总结", "summarize", "list", "列出"],
  "heavyKeywords": ["refactor", "重构", "implement", "实现", "debug", "调试"],
  "shortTaskMaxChars": 120,
  "peakDemoteUnknown": true,
  "unknownToFlash": false,
  "peakHours": [[9, 12], [14, 18]],
  "budgetCapTokens": 0
}
```

- `shortTaskMaxChars: 0` 关闭短任务规则；`peakDemoteUnknown: false` 关闭
  峰谷降级；`unknownToFlash: true` 把一切未命中任务送去 Flash（激进，默认
  保持 `false`）；`budgetCapTokens: 0` 关闭预算上限。
- 模型路由也可用环境变量 `DSH_DELEGATE_ROUTER_FLASH_PROVIDER` /
  `DSH_DELEGATE_ROUTER_FLASH_MODEL` / `DSH_DELEGATE_ROUTER_PRO_PROVIDER` /
  `DSH_DELEGATE_ROUTER_PRO_MODEL` 提供。
- 改完文件需重启 DSH；运行中可用 `/delegate <mode>` 切模式。

## 开发

```sh
npm install
npm run smoke              # 清单自检
node scripts/test-routing.mjs   # 确定性规则单测
node scripts/measure-savings.mjs # 基于 ~/.dsh/sessions 的真实省钱测算
node scripts/e2e-panel-loop.mjs  # 针对测试实例的浏览器 E2E
```

## 许可证

MIT

## 致谢

为 DeepSeek Harness 插件生态而作——感谢 [LINUX DO](https://linux.do/)
社区的反馈与测试。
