# pi-web macOS 工作台 — 开发计划

**版本**：2026-06-03  
**状态**：规划中  
**范围**：pi 能力 → pi-web 产品化 + macOS 独立 App + 非技术用户  
**基线**：pi-web 已具备会话/分支/远程/场景/Skills；pi fork（asiachrispy/pi）已含 `navigate_tree`、`get_tools`、`set_tools` RPC

---

## 1. 产品定位

| 维度 | 定义 |
|------|------|
| **是什么** | 本地优先的 macOS AI 工作台（内嵌 pi-web + pi AgentSession） |
| **不是什么** | pi TUI 的网页复刻、模型游乐场、面向开发者的裸 RPC 控制台 |
| **核心用户** | 非技术用户（运营、业务、知识工作者）；进阶/开发者走「高级模式」 |
| **技术底座** | 与 pi 共用 `~/.pi/agent`（sessions、models、skills）；App 内锁定 `@earendil-works/pi-coding-agent` 版本 |

### 1.1 产品原则

1. 能力来自 pi，表达来自 pi-web（白话 UI，隐藏 provider / cwd / compact 等术语）。
2. 新能力优先走 RPC / `AgentSession`，在 `rpc-manager` → `useAgentSession` → UI 接线。
3. macOS 壳负责「装好就能用」；pi-web 负责「聊得起来、管得住会话」。
4. 远程、Bash、扩展编写等默认关闭或后置。

### 1.2 术语对照（UI 文案）

| pi / 技术 | 产品文案 |
|-----------|----------|
| cwd | 工作区 |
| compact | 整理对话 / 自动整理长对话 |
| fork | 从这里另开一版 |
| clone | 复制当前进度为新对话 |
| navigate_tree + summarize | 回到这里并先总结之前内容 |
| provider / models.json | AI 服务 / 账户 |
| steer / follow_up | 中途改方向 / 完成后补充说明 |
| agent_end | 任务完成 |

### 1.3 一句话总结

> 用 pi 做引擎，用 pi-web 做产品，用 macOS App 做交付。

第一阶段：**安装即用、账户即连、场景即开、长任务稳定、结果可导出、完成有通知。**

**贯穿原则（M1–M4 必读）**：[product-principles.md](./product-principles.md) — 凭据/工作区/壳/实现简单，与 CLI 共用 `~/.pi/agent`。

---

## 2. 现状基线

### 2.1 pi-web 已有

- **对话**：流式 SSE、图片、中止、Steer / Follow-up
- **会话**：按工作区分组、新建、Fork、分支树、`navigate_tree`、侧栏刷新（`pinnedSession` + `filterCwd`）
- **配置**：Models + OAuth、Skills 安装、工具三档预设、`get_tools` / `set_tools`（RPC 已接）
- **产品层**：Scenes、历史、场景覆盖、用量摘要、自动化占位
- **远程**：配对、Push、PWA、relay、审计（高级，默认应关）
- **启动**：`bin/pi-web.js` 本地服务（默认端口 `30141`）

### 2.2 pi（asiachrispy fork）已有

- RPC：`navigate_tree`、`get_tools`、`set_tools` 及文档 / 测试

### 2.3 macOS App（壳层，已定）

- **薄 `.app`**：内嵌 Node + pi-web 构建产物；spawn [`bin/pi-web.js`](../bin/pi-web.js)；WKWebView 打开 `127.0.0.1:30141`
- **不引入** Electron / Tauri（见 [product-principles.md](./product-principles.md) §4）

### 2.4 相关设计文档

- `docs/product-principles.md` — 全里程碑原则源（凭据、工作区、壳、实现约束）
- `docs/m1-design.md` — M1 产品设计与技术方案（IA、流程、壳契约、API）
- `docs/superpowers/specs/2026-06-01-pi-web-enterprise-workbench-design.md` — 场景驱动工作台方向
- `docs/remote-access.md` — 远程访问（需白话包装后暴露给普通用户）

---

## 3. 目标与成功指标

| 阶段 | 目标 | 验收 |
|------|------|------|
| **M1** | 非技术用户安装后 5 分钟内完成首条有效对话 | 向导 + 账户 + 场景发消息成功率 ≥ 95%（内测） |
| **M2** | 长任务稳定、结果可带走 | 自动压缩/重试默认开；HTML 导出可用 |
| **M3** | 体现 pi 差异化（分支/会话资产） | 分支白话化 + 命名 + 统计 + Fork/Clone 区分清晰 |
| **M4** | 平台化（扩展 / 分享 / 场景包） | 扩展浏览、只读分享、场景 JSON 包 |

---

## 4. 能力 Backlog

### 4.1 平台与 macOS 壳（非 RPC）

| ID | 能力 | 优先级 | 说明 |
|----|------|--------|------|
| PL-01 | 启动探活与状态页 | P0 | 壳启动 → 检测 `30141` →「正在启动 / 失败一键重启」 |
| PL-02 | 首次运行向导 | P0 | 工作区 → AI 账户 → 通知授权 → 完成首聊 |
| PL-03 | 菜单与数据入口 | P0 | 退出、重启服务、打开数据文件夹（`~/.pi/agent` 白话说明） |
| PL-04 | 系统通知 | P0 | `agent_end` → macOS 通知；点击深链回会话 |
| PL-05 | 凭据与 CLI 共用 `auth.json` | P0 | OAuth/API key 经 `/api/auth` 写入 `~/.pi/agent/auth.json`；M1+ **不做 Keychain** |
| PL-06 | 工作区授权 | P0 | macOS 目录访问与 cwd 选择器一致 |
| PL-07 | 自动更新 | P1 | 壳层 Sparkle / 内置版本升级 |
| PL-08 | Dock / 菜单栏状态 | P1 | 运行中任务数、需登录提示 |

### 4.2 pi 能力 → pi-web（RPC / API）

| ID | pi 能力 | 优先级 | pi-web 落点 | 工程 |
|----|---------|--------|-------------|------|
| PI-01 | `set_auto_compaction` | P0 | 设置开关，默认开 | 低 |
| PI-02 | `set_auto_retry` / `abort_retry` | P0 | 设置开关 + 重试中中止 | 低 |
| PI-03 | `export_html` | P0 | 「导出对话」→ 下载 HTML | 低（需 `rpc-manager` 接线） |
| PI-04 | `get_session_stats` | P0 | 设置/侧栏简版用量（token/费用白话） | 低 |
| PI-05 | `set_session_name` | P1 | 顶栏可编辑标题 | 低 |
| PI-06 | `navigate_tree` + summarize | P1 | 分支切换弹窗：是否摘要、说明 | 中 |
| PI-07 | `clone` | P1 | 「复制为新对话」 | 中（`rpc-manager`） |
| PI-08 | `set_steering_mode` / `set_follow_up_mode` | P1 | 设置：一次一条 / 全部 | 低 |
| PI-09 | SSE `queue_update` | P1 | 输入栏上「已排队 N 条」 | 低 |
| PI-10 | `get_tools` / `set_tools` 逐项 | P1 | 高级模式工具勾选 | 低（RPC 已有） |
| PI-11 | `get_commands` + `/` 面板 | P2 | 进阶：扩展/内置命令 | 中 |
| PI-12 | Skills / 模板按钮化 | P2 | 弱化 `/skill:`，按钮插入 | 中 |
| PI-13 | `bash` / `abort_bash` | P3 | 仅高级模式 | 中 |
| PI-14 | `switch_session` | P2 | 多 Tab 少冷启动 | 高 |
| PI-15 | compaction 时间线 | P1 | 压缩块可视化（读 jsonl 已有） | 中 |

### 4.3 产品层（pi-web 独有）

| ID | 能力 | 优先级 | 说明 |
|----|------|--------|------|
| PR-01 | 场景首页为默认入口 | P0 | 首屏不暴露 cwd / 会话树术语 |
| PR-02 | 工具「简洁 / 标准 / 高级」三档 | P0 | 简洁=能力描述，非工具名列表 |
| PR-03 | 远程能力白话包装 | P2 | 「手机查看进度」；默认关 |
| PR-04 | 历史 + 场景用量 | P1 | `/api/usage`、`WorkbenchHistory` |
| PR-05 | 自动化触发 | P2 | 定时/一键跑场景（接现有 automation API） |

### 4.4 明确不做（v1–v2 默认用户）

- TUI 主题 / `keybindings.json`
- 扩展 `ctx.ui.custom` 全屏组件
- 裸 `models.json` 文本编辑（改为表单 + 套餐）
- 默认开启 `--remote` / `0.0.0.0`
- Gist `/share`（用 HTML 导出替代）
- Bash 面板给默认用户

---

## 5. 分阶段实施计划

| 里程碑 | 清单 |
|--------|------|
| M1 | [m1-checklist.md](./m1-checklist.md) · [m1-design.md](./m1-design.md) · [product-principles.md](./product-principles.md) |
| M2 | [m2-checklist.md](./m2-checklist.md) · [product-principles.md](./product-principles.md) |
| M3 | [m3-checklist.md](./m3-checklist.md) · [product-principles.md](./product-principles.md) |
| M4 | [m4-checklist.md](./m4-checklist.md) · [m4-design.md](./m4-design.md) · [product-principles.md](./product-principles.md) |

### Milestone 1（M1）— 能独立交付的 macOS App

**周期**：约 4–6 周  
**目标**：双击 → 向导 → 场景 → 首条对话成功。  
**执行清单**：[m1-checklist.md](./m1-checklist.md)（可勾选跟踪）

| 工作包 | 任务 | 主要模块 |
|--------|------|----------|
| M1-A 壳 | PL-01/02/03/06；启动契约 | macOS 壳、`bin/pi-web.js` |
| M1-B 向导 | 首次运行 UI；选工作区 cwd + preferences；检测 agent/models | 新 `FirstRunWizard`、`pi-web-preferences.json` |
| M1-C 模型 | 设置 → ModelsConfig；OAuth/API Key + 默认模型 + models.json 表单 | `ModelsConfig.tsx` |
| M1-D 首页 | PR-01 场景默认；PR-02 简洁工具模式 | `WorkbenchHome`、`AppShell` |
| M1-E 稳定性 | PI-01/02 | `useAgentSession`、`rpc-manager`、`WorkbenchSettings` |
| M1-F 结果 | PI-03 导出；PI-04 简版统计 | `rpc-manager`、`ChatWindow` / 设置 |
| M1-G 通知 | PL-04 + Web Push 策略统一 | `lib/push-notifications.ts`、壳通知桥 |
| M1-H 质量 | i18n；侧栏刷新回归 | `SessionSidebar`、测试 |

**交付物**

- macOS `.app`（内嵌固定版本 pi-web 构建产物）
- 用户文档：安装、工作区、账户、数据位置（1 页）

**验收清单**

- [ ] 新机器无单独安装 Node 亦可完成首聊
- [ ] 自动压缩 / 自动重试默认开启且可关闭
- [ ] 导出 HTML 可在 Finder 中打开
- [ ] 任务结束收到系统通知并可回到对应会话

---

### Milestone 2（M2）— 日常办公够用

**周期**：约 4–6 周  
**目标**：长对话、分支、会话资产可管理。  
**执行清单（v1.1 验收以本清单为准）**：[m2-checklist.md](./m2-checklist.md) — 仅 **M2-01～06**；下表 M2-C～G 为 backlog，不纳入 v1.1 里程碑勾选。

| 工作包 | 任务 | 主要模块 |
|--------|------|----------|
| M2-A 会话 | PI-05 标题编辑 | `SessionSidebar`、`AppShell`、PATCH/RPC |
| M2-B 分支 | PI-06 摘要跳转；PI-07 Clone；Fork/Clone 文案 | `BranchNavigator`、`MessageView`、`rpc-manager` |
| M2-C 队列 | PI-08/09 模式 + 队列条 | `ChatInput`、`useAgentSession` |
| M2-D 上下文 | PI-15 compaction 时间线 | `MessageView`、`session-reader` |
| M2-E 工具 | PI-10 高级勾选；三档模式 | `ToolPanel` |
| M2-F 产品 | PR-04 历史/用量；场景模板入口 | `WorkbenchHistory`、`/api/usage` |
| M2-G 壳 | PL-07/08 更新与 Dock 状态 | macOS 壳 |

**验收清单**

- [ ] 分支切换可选「先总结」
- [ ] Clone 与 Fork 对用户语义清晰
- [ ] 会话标题持久化并在列表展示
- [ ] 压缩记录在时间线可见

---

### Milestone 3（M3）— 强于普通 Chat

**周期**：约 6–8 周  
**目标**：进阶用户与轻度团队场景。  
**执行清单（v2.0.0 验收以本清单为准）**：[m3-checklist.md](./m3-checklist.md) — **v2.0.0 仅 M3-01～06**（对齐 M2 六件套）；多 Tab / 模板一键 / token 用量 / Dock 为 **v2.0.1 或 backlog**，见清单「对照 M1/M2 评审」。

| 工作包 | 任务 |
|--------|------|
| M3-01 | PI-11 `/` 命令面板（高级模式，`get_commands`） |
| M3-02 | PI-12 聊天区插入技能（无模板库） |
| M3-03 | PR-03 远程白话向导 |
| M3-04 | PR-04 用量概览（7 日会话活动，简版） |
| M3-05 | PI-03 导出 HTML（闭合 M1-F 欠账） |
| M3-06 | 交付：`test:m3`、进阶文档 |
| v2.0.1+ | 多 Tab、模板+一键运行、token 图表、Dock（见 m3-checklist） |

---

### Milestone 4（M4）— 平台化（v2.1.0）

**执行清单**：[m4-checklist.md](./m4-checklist.md) · **设计**：[m4-design.md](./m4-design.md)（立项 2026-06-04，待评审）

- M4-01 扩展只读目录（高级）
- M4-02 场景包 JSON 导入 / 导出
- M4-03 分享对话向导（HTML + 只读 remote 说明）
- v2.2+：团队场景同步、扩展 enable/disable、多 Tab

---

## 6. 技术实施顺序（pi-web 仓库）

同一里程碑内建议依赖顺序：

```
1. rpc-manager 补命令：export_html, get_session_stats, clone,
   set_steering_mode, set_follow_up_mode, set_session_name
2. useAgentSession：SSE queue_update、stats
3. WorkbenchSettings / FirstRunWizard / ModelsConfig
4. AppShell：scene-first 默认路由与工具模式
5. BranchNavigator / MessageView：分支与 Clone 文案
6. i18n + 测试
7. macOS 壳联调：PI_CODING_AGENT_DIR、通知桥、健康检查
```

### 6.1 与上游 pi 协作

- pi-web 依赖的 RPC 先在 **asiachrispy/pi** 合并并打 tag；App 捆绑该版本。
- 新 RPC 先改 `packages/coding-agent/docs/rpc.md` 与 `rpc-mode.ts`，再改 pi-web。
- 会话文件格式以 pi 为准；不 fork 独立存储。

### 6.2 关键文件地图

| 领域 | 路径 |
|------|------|
| RPC 封装 | `lib/rpc-manager.ts` |
| 会话读写 | `lib/session-reader.ts` |
| 对话状态 | `hooks/useAgentSession.ts` |
| 布局 | `components/AppShell.tsx` |
| 侧栏 | `components/SessionSidebar.tsx` |
| 输入 | `components/ChatInput.tsx` |
| 场景 | `lib/scenes.ts`、`components/WorkbenchHome.tsx` |
| 远程 | `lib/remote-auth.ts`、`components/RemoteAccessSettings.tsx` |
| 启动 | `bin/pi-web.js` |

---

## 7. 风险与缓解

| 风险 | 缓解 |
|------|------|
| macOS 沙箱无法读用户选的工作区 | 向导内显式授权；cwd 与授权路径一致 |
| 非技术用户误开远程 | 默认关；独立高级页 + 风险提示 |
| RPC 与文件列表不一致 | `refreshKey` + `pinnedSession`（已实现，需回归） |
| 壳与 pi-web 版本漂移 | 锁版本；关于页显示版本号 |
| App/CLI 凭据分叉 | 仅 `auth.json`（`AuthStorage.create()`）；禁止 Keychain / App 专用 token |
| 扩展命令不可预测 | v1 不暴露；v2 白名单展示 `get_commands` |
| 并发 `loadSessions` 覆盖新数据 | 请求序号守卫（已实现，需回归） |

---

## 8. 资源粗估（单人全栈参考）

| 里程碑 | pi-web（人周） | macOS 壳（人周） |
|--------|----------------|------------------|
| M1 | 3–4 | 1–2 |
| M2 | 3–4 | 0.5–1 |
| M3 | 4–6 | 1 |
| M4 | TBD | TBD |

---

## 9. 建议 Issue 列表（按里程碑）

详见各清单文末「建议 Issue」小节：

- [m1-checklist.md](./m1-checklist.md) — M1（8 项）
- [m2-checklist.md](./m2-checklist.md) — M2（9 项）
- [m3-checklist.md](./m3-checklist.md) — M3（8 项）
- [m4-checklist.md](./m4-checklist.md) — M4（立项后）

---

## 10. 版本路线图对照

| 产品版本 | 对应里程碑 | 用户感知 |
|----------|------------|----------|
| v1.0 | M1 | 装好就会用 |
| v1.1–1.2 | M2 | 比普通 AI Chat 更能管对话 |
| v2.0 | M3 | 进阶命令、多 Tab、自动化 |
| v2.x+ | M4 | 团队与平台 |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-06-03 | 合并「pi→pi-web 能力矩阵」与「macOS 非技术用户」两版方案，初稿 |
| 2026-06-03 | 拆分 M1–M4 执行清单为独立 `docs/m*-checklist.md` |
