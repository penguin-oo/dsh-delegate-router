# dsh-subagent-router

> [中文](README.zh.md) · [English](README.md)

**给 DeepSeek Harness 的子代理调用做 Flash/Pro 自动分派。**

主对话保持跑强模型（如 V4 Pro）；当 agent 派子代理干活时，本插件对任务做
复杂度分类：**轻任务（搜索/总结/列文件…）自动用便宜模型（如 V4 Flash）**，
重任务（重构/实现/调试…）留在强模型——确定性分派，不靠模型自觉。

- **自动路由** — 轻任务走 Flash、重任务留 Pro（关键词规则，可配置）
- **手动覆盖** — `subagent`/`subagent_fork` 工具新增 per-call
  `provider`/`model` 参数，任何一次调用都可强制指定模型
- **`/delegate` 命令** — 会话级模式切换：`/delegate auto | off | flash-all`
- **预算降级** —（配置已就绪，token 统计在后续版本接入）超过
  `budgetCapTokens` 后新子代理自动降级 Flash
- **决策账本** — 每次分派记录（任务、目标模型、触发原因）落入存储域，
  省钱面板规划中

## 工作原理

插件在每个 agent 的作用域上下文里包装官方 `subagent`/`subagent_fork` 工具
（与经过验证的 `dsh-reasoning-settings` 同一机制），在包装器内做任务分类，
并在 `agent/request` 瀑布中改写子代理的首次请求——官方生命周期不动。
已端到端实测：一次「搜索」委派让子会话跑在 `deepseek-v4-flash`，
父会话保持在 `deepseek-v4-pro`。

## 安装

```sh
dsh plugin --profile web add dsh-subagent-router
```

## 配置

Flash/Pro 路由二选一设置：改配置档 patch 的 config，或用环境变量
（两者都未配置时路由器不动作）：

```sh
setx DSH_SUBAGENT_ROUTER_FLASH_PROVIDER "<provider>"
setx DSH_SUBAGENT_ROUTER_FLASH_MODEL   "<flash模型id>"
setx DSH_SUBAGENT_ROUTER_PRO_PROVIDER  "<provider>"
setx DSH_SUBAGENT_ROUTER_PRO_MODEL     "<pro模型id>"
```

设置后重启 DSH。模式：`auto`（默认）、`off`、`flash-all`，运行中可用
`/delegate <mode>` 切换。

## 开发

```sh
npm install
npm run smoke
node scripts/e2e-delegate.mjs   # 针对测试实例的浏览器 E2E
```

## 许可证

MIT

## 致谢

为 DeepSeek Harness 插件生态而作——感谢 [LINUX DO](https://linux.do/)
社区的反馈与测试。
