# minder MVP 设计

日期：2026-11-08  
仓库：https://github.com/DDDong-11/minder  
状态：已确认（用户授权后续段落无需逐段确认）

## 1. 目标

做一套可 `npm` 安装的本机 CLI：**开发日报** + **Claude 会话上下文监控看板**。  
首期不实现 Super-agent Router / 派活；herdr 仅作日报润色的可选依赖。

## 2. 非目标（MVP 不做）

- Router、ticket、Worker 编排、失败重试策略
- 依赖 Alma / 任何 GUI 壳
- 把 transcript 文件大小当作真实模型 token 占用百分比对外承诺
- 强制安装 herdr
- 云端同步、多机控制面

## 3. 用户体验

安装：`npm i -g minder`（或 `npx minder`）。

```text
minder init     # 交互配置向导
minder daily    # 生成日报
minder watch    # 常驻扫描 + 告警
minder dash     # 本地 HTTP 看板（默认 :3920）
```

`init` 写入 `~/.minder/config.json`，后续命令读配置，不每次手填路径。

## 4. 架构

```text
CLI (TypeScript)
  init  → 写 ~/.minder/config.json
  watch → 扫 Claude 会话目录 → 指标 / 告警状态
  dash  → localhost:3920 看板（读同一套指标 + 摘要）
  daily → git 确定性汇总 →（可选）herdr + Claude 润色
```

原则：

- 监控与看板是确定性逻辑，不依赖 LLM / herdr。
- herdr 仅在 `daily --polish`（或配置 `polish: true`）时调用；缺失则跳过润色并提示。
- Electron 不做；Java 不做。单 npm 包。

## 5. 配置（`~/.minder/config.json`）

字段（首期）：

| 字段 | 含义 |
|------|------|
| `repos` | 日报覆盖的本地 git 仓库路径列表 |
| `reportDir` | 日报输出目录 |
| `claudeDir` | Claude 配置/会话根目录（默认 `~/.claude`，尊重 `CLAUDE_CONFIG_DIR`） |
| `dashboardPort` | 默认 `3920` |
| `thresholds.maxBytes` | 告警：单会话 transcript 体积上限（init 必填，无硬编码默认） |
| `thresholds.maxTurns` | 告警：轮次上限（init 必填） |
| `polish.enabled` | 是否默认尝试 herdr 润色 |
| `polish.agent` | 默认 `claude` |

`init` 对阈值做交互询问；不提供隐藏默认值。

## 6. 命令行为

### 6.1 `init`

交互选择/填写：仓库路径、日报目录、Claude 目录、端口、阈值、是否启用润色。  
幂等：已有配置时提示覆盖或合并。

### 6.2 `daily`

1. 对每个 `repos` 路径：`git log` / `git status` / 变更文件列表（当天或 `--since`）。
2. 写出确定性 Markdown 到 `reportDir`（文件名含日期）。
3. 若启用润色且本机有 `herdr`：经 herdr 启动 Claude Worker，输入确定性稿，写回润色版；否则只保留确定性稿并打印说明。

### 6.3 `watch`

常驻进程：按间隔扫描 `claudeDir` 下会话 transcript（JSONL 等实际布局以探测为准）。  
产出：每会话 `id`、路径、bytes、turns、增长率、是否超阈值、最近更新时间。  
超阈值：终端输出 + 可选系统通知；状态供 `dash` 读取（共享状态文件 `~/.minder/state/sessions.json`）。

明确文案：指标是 **本地日志/文件代理指标**，不是模型上下文窗口精确占用。

### 6.4 `dash`

在 `dashboardPort` 启动仅绑定 `127.0.0.1` 的 HTTP 服务。

页面能力：

- 会话列表：体积、轮次、告警状态、更新时间
- 点开：transcript **摘要预览**（截取头尾/最近 N 条消息的短摘要，不做全量渲染）
- 自动刷新或手动刷新

## 7. 模块边界

```text
src/
  cli.ts              # 命令入口
  config.ts           # 读写配置
  daily/
    git-summary.ts    # 确定性 git 汇总
    polish.ts         # 可选 herdr 调用
  watch/
    scan.ts           # 扫描会话
    metrics.ts        # 体积/轮次
    alert.ts          # 阈值与通知
  dash/
    server.ts         # 本地 HTTP
    ui/               # 简单静态页或轻量模板
  claude/
    locate.ts         # 解析会话目录与 transcript 路径
```

## 8. 数据与隐私

- 全部本地；不上传。
- 看板仅 `127.0.0.1`。
- 摘要预览可能含代码片段：文档中说明风险；不提供公网暴露选项。

## 9. 错误处理

- 未 `init`：命令失败并提示先 init。
- 仓库非 git：跳过并记录。
- herdr / claude 不可用：日报仍成功（无润色）。
- Claude 目录不存在：watch/dash 明确报错路径。
- 端口占用：提示改配置或 `--port`。

## 10. 测试

- 单元：git 汇总解析、阈值判断、配置读写。
- 固件：假 transcript JSONL → 指标与摘要截断。
- 手工：本机 `init` → `watch`/`dash`/`daily` 冒烟。

## 11. 发布

- GitHub：`DDDong-11/minder`
- 包名：`minder`（若 npm 名冲突则改 `@dddong-11/minder`，实施前再确认）
- README：安装、init、四命令、隐私与指标含义

## 12. 后续（非 MVP）

- Router / ticket / herdr Worker 派活
- 定时调度封装（launchd/cron 助手）
- 多 agent 宿主（Codex 等）会话目录适配
- 更准的上下文占用（若 Claude/herdr 暴露正式遥测）
