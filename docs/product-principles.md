# pi-web 贯穿原则（全里程碑）

**版本**：2026-06-03  
**适用范围**：M1–M4 及后续 pi-web / macOS App 工作  
本文是**唯一原则源**。各里程碑清单与总计划仅引用本文，避免多处表述分叉。

---

## 1. 产品原则

1. **能力来自 pi，表达来自 pi-web** — 白话 UI，隐藏 provider / cwd / compact 等术语（见总计划术语表）。
2. **默认用户 vs 高级** — Workbench 首页、简洁工具、模型配置（ModelsConfig）为主路径；会话树、完整工具、远程、命令面板等走「高级」入口。
3. **远程默认关闭** — 非 `0.0.0.0` 监听；开启须经白话向导与风险提示（M3 产品化，M1 不暴露给默认用户）。
4. **实现从简** — 优先接已有 RPC / `AgentSession`；不做 Keychain、不 duplicate 凭据、不引入 Electron/Tauri 除非经显式修订。

### 功能门禁（每个 M2+ 项开工前必答）

写进清单或 PR 前，用两句话否决或砍 scope：

1. **用户真的需要吗？** — 默认用户会不会在首周就用到？能否用 pi/CLI 已有行为凑合？有没有真实反馈或重复痛点？
2. **能否更简单？** — 能否少一档设置、少一个入口、用 pi 默认代替选项页？能否先做「一条主路径 + 高级入口」而不是对称的完整配置？

未通过门禁的项：**不进当前里程碑**，记入下一里程碑 backlog 或明确不做。

---

## 2. 与 CLI 一致（数据与凭据）

App 与终端 `pi` **共用**同一智能体目录，默认 `~/.pi/agent`（可用 `PI_CODING_AGENT_DIR` 覆盖）。

| 路径 | 用途 | 要求 |
|------|------|------|
| `auth.json` | API Key、OAuth 令牌 | App 必须用 `AuthStorage.create()` 读写；**禁止** App 专用存储（Keychain、`localStorage` 密钥） |
| `settings.json` | 默认模型、压缩/重试等 | 与 CLI 同一文件；设置页改动即 CLI 可见 |
| `sessions/<encoded-cwd>/` | 按工作区分的会话 jsonl | App 创建的会话，CLI 在同一 `cwd` 下应能列出 |

在 App 里 `/login` 或 OAuth 成功后，终端里 `pi` 应能直接使用同一 provider，反之亦然。

---

## 3. 工作区（cwd）

- **定义**：工作区 = 用户选择的**文件夹路径**（`cwd`），与「先 `cd` 再跑 `pi`」一致。
- **向导 / 偏好**：默认路径记在 `pi-web-preferences.json` 的 `defaultWorkspaceCwd`（M1 起）；新建会话默认使用该路径。
- **`POST /api/default-cwd`**：创建 `~/pi-cwd-<日期>/` 仅为 pi-web **可选快捷**，不是 CLI 约定，**不得**作为向导主路径或「与 CLI 一致」的默认工作区。
- **禁止**：将 `~/pi-work-*` 或按日自动建新目录作为全局默认工作区主方案。

---

## 4. macOS 交付（壳）

| 层级 | 方案 |
|------|------|
| 服务 | [`bin/pi-web.js`](../bin/pi-web.js) — 本机 Next（默认 `127.0.0.1:30141`） |
| App | **薄 `.app`**：内嵌 Node + pi-web 构建产物；spawn `pi-web.js`；**WKWebView** 打开本地 URL |
| 不做 | Electron、Tauri（M1–M4 默认不引入） |

M2+ 壳增强（Sparkle 自动更新、Dock 状态、菜单栏）在**同一薄壳模型**上扩展，不更换技术栈。

壳职责边界：启动/探活/重启服务、系统通知、打开 `~/.pi/agent`、可选选目录 IPC；**不**实现 OAuth 存储或业务 RPC。

---

## 5. 实现约束

1. 新能力：**pi RPC / `lib/rpc-manager.ts`** → `hooks/useAgentSession.ts` → UI。
2. 会话文件格式以 pi 为准；不 fork 独立存储。
3. 用户可见文案：**i18n**（`zh-CN` / `en`），禁止硬编码新增 UI 字符串。
4. pi-web 产品态偏好：`~/.pi/agent/pi-web-preferences.json`（工具模式、`defaultWorkspaceCwd` 等），不替代 `auth.json` / `settings.json`。

### 明确不做（默认用户，v1–v2）

- TUI 主题 / `keybindings.json` 暴露
- 裸 `models.json` 文本编辑（用 ModelsConfig 表单，含连接状态）
- 默认开启远程 / Bash 面板
- Gist `/share`（用 HTML 导出替代）
- Keychain 或第二套 OAuth 存储

---



---

## 进度记录

| 日期 | 说明 |
|------|------|
| 2026-06-03 | 初版：全里程碑原则源 |
| 2026-06-04 | 增加功能门禁（用户需要吗 / 能否更简单） |
