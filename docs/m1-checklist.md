# M1 验收清单 — macOS 独立 App（v1.0）

**目标**：非技术用户双击 App 后，约 5 分钟内完成首次有效对话。  
**周期**：约 4–6 周  
**总计划**：[plan-pi-web-macos-workbench.md](./plan-pi-web-macos-workbench.md)  
**设计 & 技术方案**：[m1-design.md](./m1-design.md)  
**其它里程碑**：[M2](./m2-checklist.md) · [M3](./m3-checklist.md) · [M4](./m4-checklist.md)

**贯穿原则**：[product-principles.md](./product-principles.md)（凭据/工作区/壳/实现简单，全阶段适用）

---

## 里程碑验收（必须全部通过）

- [ ] 新机器无需单独安装 Node，亦可完成首条对话（依赖 M1-A 壳）
- [x] 自动整理长对话、失败自动重试默认开启，且可在设置中关闭（pi-web）
- [x] 导出 HTML 可在 Finder 中正常打开（pi-web 下载；壳内打开待 M1-A 联调）
- [x] 任务结束时收到系统通知，点击可回到对应会话（pi-web：`notifyAgentEnd` + Web Push 回退；开发壳 `piNative.showNotification` + `?session=` 深链已实现；`.app` 打包待办）

---

## M1-A — macOS 壳

薄 `.app` 启动内嵌 Node + [`bin/pi-web.js`](../bin/pi-web.js)，WKWebView 打开本地服务（见 [product-principles.md](./product-principles.md) §4）。

| ID | 任务 | 完成 |
|----|------|------|
| PL-01 | 启动时探测本地服务（默认 `30141`），显示「正在启动」/ 失败态 | [x]（`macos/PiWorkbench` 开发壳；`.app` 打包待办） |
| PL-02 | 服务不可用时提供「重试 / 重启服务」 | [x]（开发壳；`.app` 打包待办） |
| PL-03 | 菜单：退出、重启服务、打开数据文件夹（`~/.pi/agent` 说明） | [x]（开发壳命令菜单；`.app` 打包待办） |
| PL-06 | 工作区目录选择与 macOS 文件访问授权一致 | [x]（开发壳：`pickWorkspaceDirectory` + security-scoped bookmark；`.app` Sandbox + Node 子进程待联调） |
| — | 文档化壳 ↔ pi-web 启动参数（`PI_CODING_AGENT_DIR`、端口） | [x]（[macos-shell-contract.md](./macos-shell-contract.md)；壳实现待 M1-A） |

---

## M1-B — 工作台首页（无向导）

产品无 `FirstRunWizard`、无场景卡片、无 `/api/onboarding/*`；首启与日常均进入 Workbench 首页。

| ID | 任务 | 完成 |
|----|------|------|
| — | 默认进入 WorkbenchHome（新建对话 + 最近记录） | [x] |
| — | 设置 / `piNative.pickWorkspaceDirectory` 配置 `defaultWorkspaceCwd`（`PUT /api/preferences`） | [x] |
| — | 无可用模型时横幅 +「配置模型」（`ModelsConfig`） | [x] |
| — | 从首页「新建对话」发起首条消息 | [x] |
| — | 通知权限在设置中配置（非向导步骤） | [x] |

**模块**：`WorkbenchHome`、`WorkbenchSettings`、`AppShell`

---

## M1-C — 模型配置（单入口）

| ID | 任务 | 完成 |
|----|------|------|
| — | 设置 →「模型」打开 `ModelsConfig`（OAuth/API Key 连接状态 + 默认模型 + models.json 表单） | [x] |
| — | 保留现有 OAuth 流程（`/api/auth/login/[provider]`） | [x] |
| — | 凭据与 CLI 共用 `~/.pi/agent/auth.json`（M1 不做 Keychain） | [x] |
| — | 无可用模型时，发消息前顶部横幅 +「配置模型」 | [x] |

**模块**：`ModelsConfig.tsx`、`WorkbenchSettings`、`AppShell`

---

## M1-D — 工作台首页与工具模式

| ID | 任务 | 完成 |
|----|------|------|
| PR-01 | 默认进入 Workbench 首页（新建对话 + 最近记录），非裸会话树 | [x] |
| PR-02 | 工具「简洁模式」：仅展示「可读文件 / 可改文件」等能力描述 | [x] |
| — | 「高级 / 开发者」入口可进入完整工具预设与会话侧栏 | [x] |
| — | 移除预设「场景」卡片（企业知识/报告/客服/流程等） | [x] |

**模块**：`WorkbenchHome.tsx`、`AppShell.tsx`、`ToolPanel` / `ChatInput`

---

## M1-E — 稳定性（pi RPC）

| ID | 任务 | 完成 |
|----|------|------|
| PI-01 | `rpc-manager` 接线 `set_auto_compaction` | [x] |
| PI-01 | 设置页开关，**默认开启** | [x] |
| PI-02 | `rpc-manager` 接线 `set_auto_retry` | [x] |
| PI-02 | 设置页开关，**默认开启** | [x] |
| — | 保留手动「整理对话」与中止整理（已有则回归） | [x] |

**模块**：`lib/rpc-manager.ts`、`WorkbenchSettings.tsx`、`hooks/useAgentSession.ts`

---

## M1-F — 导出与用量

| ID | 任务 | 完成 |
|----|------|------|
| PI-03 | `rpc-manager` 接线 `export_html` | [x] |
| PI-03 | 聊天或设置中「导出对话」→ 下载 `.html` | [ ]（RPC 已接；M1 产品 UI 不暴露下载） |
| PI-04 | `rpc-manager` 接线 `get_session_stats`（或等价聚合） | [x] |
| PI-04 | 对话顶栏「用量报告」悬停展示（输入/输出/费用） | [x] |

**模块**：`lib/rpc-manager.ts`、`SessionReportButton.tsx`

---

## M1-G — 通知

| ID | 任务 | 完成 |
|----|------|------|
| — | pi-web：`agent_end` → `notifyAgentEnd`（`piNative` 或 `POST /api/notifications/agent-end`） | [x] |
| PL-04 | 壳：`piNative.showNotification` 系统通知 | [x]（开发壳；`.app` 打包待办） |
| — | 壳：通知点击深链到 `?session=<id>` | [x]（开发壳；`.app` 打包待办） |
| — | 与现有 Web Push / `lib/push-notifications.ts` 策略不冲突 | [x] |
| — | 设置中可配置通知权限（原向导步骤已移除） | [x] |

---

## M1-H — 质量与回归

| ID | 任务 | 完成 |
|----|------|------|
| — | 侧栏新建会话后列表及时更新（`pinnedSession` / `filterCwd` 回归） | [x] |
| — | `zh-CN` / `en` 覆盖账户、设置、场景首页文案 | [x] |
| — | 相关 RPC/侧栏测试补充或更新 | [x] |
| — | `npm run lint`、`tsc --noEmit` 通过 | [x] |

---

## 交付物

- [x] macOS `.app` 安装包（`npm run package:macos` → `dist/macos/Pi.app`；内嵌 Node + pi-web 构建产物；公证待办）
- [x] 用户说明 1 页：安装、工作区、账户、数据目录位置（`docs/macos-user-guide.md`）

---

## 建议 Issue（M1 范围）

1. `feat: first-run wizard (workspace + account + notification)`
2. `feat: rpc export_html + download UI`
3. `feat: settings auto-compaction and auto-retry`
4. `feat: session stats panel (plain language)`
5. `feat: accounts page (decouple from models modal)`
6. `feat: scene-first default route + simple tool mode`
7. `chore: macOS shell launch contract + health check`
8. `docs: macOS app user guide (install, data folder, accounts)`

---

## 进度记录

| 日期 | 说明 |
|------|------|
| 2026-06-03 | 清单创建，与总计划 M1 对齐 |
| 2026-06-03 | 对齐 [product-principles.md](./product-principles.md) |
| 2026-06-03 | pi-web 侧 M1-B～H 收尾：通知桥、`hasModels` 向导、设置页最近会话导出/用量、`toolMode` 新建会话；`tsc`/lint/vitest 通过 |
| 2026-06-03 | 清单审计：pi-web 可交付项已勾选；M1-A/PL-04 壳项与里程碑「免 Node」保持未勾选；`GET /api/health` + 壳契约文档已就绪 |
| 2026-06-03 | PL-06：`WorkspaceBookmarkStore` + `package-macos-app.sh` 骨架；里程碑通知项勾选（开发壳） |
| 2026-06-03 | 移除 `FirstRunWizard`、预设 Scenes 与 `/api/onboarding/*`；首页为 WorkbenchHome（新建对话 + 最近记录） |
