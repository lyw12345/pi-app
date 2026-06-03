# M1 验收清单 — macOS 独立 App（v1.0）

**目标**：非技术用户双击 App 后，约 5 分钟内完成首次有效对话。  
**周期**：约 4–6 周  
**总计划**：[plan-pi-web-macos-workbench.md](./plan-pi-web-macos-workbench.md)  
**设计 & 技术方案**：[m1-design.md](./m1-design.md)  
**其它里程碑**：[M2](./m2-checklist.md) · [M3](./m3-checklist.md) · [M4](./m4-checklist.md)

**贯穿原则**：[product-principles.md](./product-principles.md)（凭据/工作区/壳/实现简单，全阶段适用）

---

## 里程碑验收（必须全部通过）

- [ ] 新机器无需单独安装 Node，亦可完成首条对话
- [ ] 自动整理长对话、失败自动重试默认开启，且可在设置中关闭
- [ ] 导出 HTML 可在 Finder 中正常打开
- [ ] 任务结束时收到系统通知，点击可回到对应会话

---

## M1-A — macOS 壳

薄 `.app` 启动内嵌 Node + [`bin/pi-web.js`](../bin/pi-web.js)，WKWebView 打开本地服务（见 [product-principles.md](./product-principles.md) §4）。

| ID | 任务 | 完成 |
|----|------|------|
| PL-01 | 启动时探测本地服务（默认 `30141`），显示「正在启动」/ 失败态 | [ ] |
| PL-02 | 服务不可用时提供「重试 / 重启服务」 | [ ] |
| PL-03 | 菜单：退出、重启服务、打开数据文件夹（`~/.pi/agent` 说明） | [ ] |
| PL-06 | 工作区目录选择与 macOS 文件访问授权一致 | [ ] |
| — | 文档化壳 ↔ pi-web 启动参数（`PI_CODING_AGENT_DIR`、端口） | [ ] |

---

## M1-B — 首次运行向导

| ID | 任务 | 完成 |
|----|------|------|
| — | 检测 `~/.pi/agent`、models 是否可用 | [ ] |
| — | 步骤 1：选择工作区文件夹（与 CLI 的 cwd 一致；记入 preferences，非仅 `~/pi-cwd-*`） | [ ] |
| — | 步骤 2：连接至少一个 AI 服务（跳转账户页或内嵌 OAuth） | [ ] |
| — | 步骤 3：可选开启完成通知 | [ ] |
| — | 步骤 4：从场景卡片完成首条消息 | [ ] |
| — | 完成后不再强制显示向导（本地标记已 onboarding） | [ ] |

**模块**：新 `FirstRunWizard`（或 `components/onboarding/`）、`AppShell` 路由门控

---

## M1-C — AI 服务 / 账户

| ID | 任务 | 完成 |
|----|------|------|
| — | 从 Models 弹窗拆出独立「AI 服务」设置页（白话文案） | [ ] |
| — | 保留现有 OAuth 流程（`/api/auth/login/[provider]`） | [ ] |
| — | 凭据与 CLI 共用 `~/.pi/agent/auth.json`（M1 不做 Keychain） | [ ] |
| — | 未配置账户时，发消息前给出明确引导 | [ ] |

**模块**：`AccountsSettings`（新）、`ModelsConfig.tsx`（精简或复用）

---

## M1-D — 场景首页与工具模式

| ID | 任务 | 完成 |
|----|------|------|
| PR-01 | 默认进入 Workbench 场景首页，而非裸会话树 | [ ] |
| PR-02 | 工具「简洁模式」：仅展示「可读文件 / 可改文件」等能力描述 | [ ] |
| — | 「高级 / 开发者」入口可进入完整工具预设与会话侧栏 | [ ] |

**模块**：`WorkbenchHome.tsx`、`AppShell.tsx`、`ToolPanel` / `ChatInput`

---

## M1-E — 稳定性（pi RPC）

| ID | 任务 | 完成 |
|----|------|------|
| PI-01 | `rpc-manager` 接线 `set_auto_compaction` | [ ] |
| PI-01 | 设置页开关，**默认开启** | [ ] |
| PI-02 | `rpc-manager` 接线 `set_auto_retry` | [ ] |
| PI-02 | 设置页开关，**默认开启** | [ ] |
| — | 保留手动「整理对话」与中止整理（已有则回归） | [ ] |

**模块**：`lib/rpc-manager.ts`、`WorkbenchSettings.tsx`、`hooks/useAgentSession.ts`

---

## M1-F — 导出与用量

| ID | 任务 | 完成 |
|----|------|------|
| PI-03 | `rpc-manager` 接线 `export_html` | [ ] |
| PI-03 | 聊天或设置中「导出对话」→ 下载 `.html` | [ ] |
| PI-04 | `rpc-manager` 接线 `get_session_stats`（或等价聚合） | [ ] |
| PI-04 | 设置页展示白话用量（输入/输出/费用摘要） | [ ] |

**模块**：`lib/rpc-manager.ts`、`ChatWindow` 或 `WorkbenchSettings`

---

## M1-G — 通知

| ID | 任务 | 完成 |
|----|------|------|
| PL-04 | `agent_end` 触发 macOS 系统通知（壳桥或统一路径） | [ ] |
| — | 通知点击深链到 `?session=<id>` | [ ] |
| — | 与现有 Web Push / `lib/push-notifications.ts` 策略不冲突 | [ ] |
| — | 向导中可关闭通知权限 | [ ] |

---

## M1-H — 质量与回归

| ID | 任务 | 完成 |
|----|------|------|
| — | 侧栏新建会话后列表及时更新（`pinnedSession` / `filterCwd` 回归） | [ ] |
| — | `zh-CN` / `en` 覆盖向导、账户、设置新增文案 | [ ] |
| — | 相关 RPC/侧栏测试补充或更新 | [ ] |
| — | `npm run lint`、`tsc --noEmit` 通过 | [ ] |

---

## 交付物

- [ ] macOS `.app` 安装包（内嵌固定版本 pi-web 构建产物）
- [ ] 用户说明 1 页：安装、工作区、账户、数据目录位置

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
