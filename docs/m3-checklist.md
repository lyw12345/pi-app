# M3 验收清单 — 强于普通 Chat（v2.0）

> **与总计划关系**：执行 scope 以本清单为准。[plan-pi-web-macos-workbench.md](./plan-pi-web-macos-workbench.md) § Milestone 3 仍列七包；**v2.0 仅做本清单 M3-01～06**；M3-07～09 见 v2.0.1 / backlog（对齐 M2：里程碑内 6 项 + 明确 backlog）。

**目标（一段）**：在**不改动 M1/M2 默认路径**的前提下，补齐进阶用户最缺的 pi 能力接线——`/` 命令、聊天区插入技能、远程白话向导、用量概览、M1 欠账的 HTML 导出；**多 Tab 与一键任务**体量大、易伤默认体验，放到 v2.0.1。

**周期**：约 4–5 周（v2.0.0）+ 约 2–3 周（v2.0.1，可选）  
**总计划**：[plan-pi-web-macos-workbench.md](./plan-pi-web-macos-workbench.md)  
**设计**：[m3-design.md](./m3-design.md)  
**前置**：[m2-checklist.md](./m2-checklist.md) 里程碑与 `npm run test:m2` 已通过  
**原则**：[product-principles.md](./product-principles.md) §1 功能门禁

---

## 里程碑验收（精简，须全部通过 — 仅 v2.0.0 / M3-01～06）

- [x] **高级模式**下输入 `/` 可补全并执行 `get_commands` 列出的命令（默认用户界面无 `/` 干扰）
- [x] 聊天输入区可「插入技能」（写入 `/skill:name`，不自动发送）；与 M3-01 并存时不得重复造第三套技能列表 UI
- [x] 远程访问默认关闭；设置内白话向导可完成配对（主标签无 token/jwt/relay）
- [x] 设置页可见近 7 日会话活动概览（柱/点或等价）；与 `/api/usage` 聚合一致
- [x] 聊天或设置可「导出对话」HTML，Finder 可打开（闭合 M1-F 未做项）
- [x] 进阶用户文档 1 页 + `npm run test:m3` 通过（API 冒烟，仿 M2）

> **不在 v2.0.0 里程碑内**：多会话 Tab、模板库、一键自动化、Dock 角标 — 见 v2.0.1 / backlog。

---

## 对照 M1 / M2 的评审结论（2026-06-04）

| 维度 | M1 | M2 | 原 M3（8 项） | **修订后 M3** |
|------|----|----|---------------|----------------|
| 里程碑内工作项数 | 多子包，pi-web 约 6 主题 | **6 项**（01～06） | 8 项 + 可选 07 | **6 项**（01～06） |
| 每项门禁表 | 部分 | **全部** | 有 | 保留 |
| 默认用户路径 | 首页、简洁工具 | 分支/标题/摘要 | 易被 Tab/命令打扰 | Tab/自动化 **移出** v2.0.0 |
| 壳 / 交付 | M1-A 独立 | M2-05 关于 | M3-07 Dock 混在里程碑 | Dock → backlog（同 M2-G） |
| M1 欠账 | export UI 故意未做 | M2 收 HTML 按钮 | 塞在 M3-08 | **M3-05 独立 S**（对齐 M1-F） |
| Pre-flight | 健康/壳契约 | RPC + `test:m2` | 5 条 spike | 保留 + **M3-03 前必须 m3-design** |
| 自动化 / 场景 | M1 移除四场景 | 不做场景 | M3-04 新建 automation API | **v2.0.1**；v2.0.0 不做 |

**否决 / 延后项（门禁未过或违反 M2 范式）**

| 项 | 理由 |
|----|------|
| M3-04 一键任务进 v2.0.0 | 「能否更简单」：M3-02 模板 + `POST /api/agent/new` 即可验证需求；独立 `lib/automation.ts` 过重 |
| M3-03 多 Tab 进 v2.0.0 | 体量 L、架构 spike 未做；M2 未改 `rpc-manager` 单例，不宜与 5 个 M 项同批发布 |
| M3-07 Dock | M2 已将 M2-G 整包 backlog；与 M2-05「不做 Dock」一致 |
| M3-02「保存为模板」 | 与 M3-04 重复；合并进 **v2.0.1 M3-08** |
| 里程碑写「场景动作」 | M1 已移除场景卡片，文案错误 |

**保留但收紧**

| 项 | 调整 |
|----|------|
| M3-01 命令面板 | 仅高级模式 + 偏好默认关；`get_commands` 已含 skill，不与 M3-02 做两套搜索 |
| M3-02 插入技能 | 只插入输入框；不自动 send（M2 范式：一步一事） |
| M3-06 用量 | v2.0.0 仅 **7 日会话数/完成率**；jsonl token 柱图放 v2.0.1（Pre-flight 后再定） |
| M3-05 远程 | 机能已有，=S 抛光，优先开工（同 M2 先做 S 项） |

---

## 代码库现状（规划基线）

| 能力 | 现状 | v2.0.0 | v2.0.1+ |
|------|------|--------|---------|
| `get_commands` | 未接线 | M3-01 | — |
| `switch_session` | 未接线 | — | M3-07 |
| Skills 列表 API | 有 | M3-02 插入 | — |
| `/api/automation` | 无 | — | M3-08 |
| `/api/usage` | 仅 run 计数 | M3-04 简版 | token 深化 |
| 远程 UI | 有 | M3-03 文案 | — |
| `export_html` | RPC 有、UI 无 | M3-05 | — |
| `TabBar` | 仅文件 Tab | — | M3-07 |

---

## 工作项（v2.0.0，M3-01～06）

### M3-01 — `/` 命令面板（PI-11）

| 字段 | 内容 |
|------|------|
| **门禁：用户真的需要吗？** | 进阶/扩展用户需要；**默认用户不需要**（高级模式才显示）。 |
| **门禁：能否更简单？** | 是。一个开关 + `get_commands` + `/` 弹出；不编辑扩展、不暴露 TUI 内置命令。 |
| **Scope IN** | `rpc-manager` `get_commands`；`ChatInput` `/` 过滤列表；选中 `prompt` 发 `/name`；偏好 `showSlashCommands` 默认 **false**；仅 `advancedMode` 或设置开启时启用。 |
| **Scope OUT** | 默认首页/简洁模式下的 `/`；在线写扩展；与 M3-02 再建一套完整技能浏览器。 |
| **验收** | 关闭时 `/` 行为与现网一致；开启后列表含已装 skill；选命令后会话出现对应 user 消息。 |
| **主要文件** | `lib/rpc-manager.ts`、`ChatInput.tsx`、`lib/pi-web-preferences.ts` |
| **依赖** | Pre-flight：`get_commands` 非空 |
| **体量** | M |
| **完成** | [x] |

---

### M3-02 — 聊天区「插入技能」（PI-12 子集）

| 字段 | 内容 |
|------|------|
| **门禁：用户真的需要吗？** | 是。`SkillsConfig` 在设置深处，聊天中一键插入是独立场景。 |
| **门禁：能否更简单？** | 是。**仅**「插入技能」菜单 → 输入框追加 `/skill:name`；不做模板库（v2.0.1）。 |
| **Scope IN** | `ChatInput` 工具区按钮；`GET /api/skills`；插入后不自动发送；i18n。 |
| **Scope OUT** | 保存模板；四场景门户；团队同步。 |
| **验收** | 点击后输入框可见 `/skill:…`；用户可自行编辑再发送。 |
| **主要文件** | `ChatInput.tsx` |
| **依赖** | 与 M3-01 可并行；列表数据源可与 `get_commands` 对齐避免漂移（实现时二选一为主数据源） |
| **体量** | S |
| **完成** | [x] |

---

### M3-03 — 远程访问白话化（PR-03）

| 字段 | 内容 |
|------|------|
| **门禁：用户真的需要吗？** | 机能已有；缺**能读懂**的开启路径（M1 原则 §3）。 |
| **门禁：能否更简单？** | 是。只改文案与向导步骤。 |
| **Scope IN** | 默认关；设置 → 高级 → 远程；向导：用途 → 风险 → QR；标签用「配对设备」「手机查看」「只读」；`remote-access.md` 链接；审计入口保留。 |
| **Scope OUT** | 新协议；默认开远程；重写 pairing 后端。 |
| **验收** | zh-CN/en 主流程无 jwt/token 作为主按钮文案；配对成功仍可用。 |
| **主要文件** | `RemoteAccessSettings.tsx`、`RemotePairingModal.tsx`、`lib/i18n/messages/*.ts` |
| **依赖** | 无 |
| **体量** | S |
| **完成** | [x] |

---

### M3-04 — 用量概览（PR-04 简版，闭合 M2-F 一部分）

| 字段 | 内容 |
|------|------|
| **门禁：用户真的需要吗？** | 进阶用户要趋势；默认用户已有顶栏悬停 stats（M1-F）。 |
| **门禁：能否更简单？** | 是。v2.0.0 **仅**按日会话数 + 完成/进行中（现有 `buildUsageSummary` + 按 `modified` 分桶）。 |
| **Scope IN** | 扩展 `lib/usage.ts` + `GET /api/usage?days=7`；`WorkbenchSettings` 一张卡片 + 简单柱图；服务端聚合不扫全量 jsonl（或限最近 N 文件）。 |
| **Scope OUT** | token/费用柱图（→ v2.0.1）；按场景占比；CSV 导出。 |
| **验收** | 7 日柱图与侧栏会话日期分布一致；加载 &lt;2s（本地 100 会话量级）。 |
| **主要文件** | `lib/usage.ts`、`app/api/usage/route.ts`、`WorkbenchSettings.tsx` |
| **依赖** | Pre-flight：是否 v2.0.1 扫 jsonl `message.usage`（不影响 v2.0.0） |
| **体量** | M |
| **完成** | [x] |

---

### M3-05 — 导出 HTML（闭合 M1-F / M2 backlog）

| 字段 | 内容 |
|------|------|
| **门禁：用户真的需要吗？** | 是。M1 已接 RPC，清单明确未做 UI；M2 延后到 M3。 |
| **门禁：能否更简单？** | 是。一个按钮 + 下载（同 M2-05 体量）。 |
| **Scope IN** | 聊天菜单或设置「导出对话」→ `export_html` RPC → 触发浏览器下载；错误白话提示。 |
| **Scope OUT** | 壳内自动用 Finder 打开（可选增强）；PDF。 |
| **验收** | 导出文件本地可开；与 CLI 导出同会话内容大致一致。 |
| **主要文件** | `lib/rpc-manager.ts`（已有）、`ChatInput` 或 `WorkbenchSettings`、`app/api/agent/.../export` 若已有则复用 |
| **依赖** | 无 |
| **体量** | S |
| **完成** | [x] |

---

### M3-06 — 交付、质量与回归

| 字段 | 内容 |
|------|------|
| **Scope IN** | `docs/advanced-features.md`（进阶功能，无 RPC 术语）；v2.0 发布说明；`scripts/m3-preflight.mjs` + `npm run test:m3`（health、preferences、`get_commands`、export 链路）；`tsc`/vitest 回归。 |
| **Scope OUT** | 多 Tab 手测（v2.0.1）；CLI 回归重复 M2-06 除非改 usage API。 |
| **验收** | 文档可读；`npm run test:m3` 绿；与 M2 相同「清单内 6 项全 [x] 才算里程碑过」。 |
| **体量** | S |
| **完成** | [x] |

---

## v2.0.1（可选第二批，不进 v2.0.0 里程碑）

| ID | 内容 | 体量 | 前置 |
|----|------|------|------|
| M3-07 | 多会话 Tab（`switch_session` 或 multi-wrapper）；`docs/m3-design.md` | L | Pre-flight spike |
| M3-08 | 用户模板 + 设置页「一键运行」（`agent/new` + 模板元数据，**不**恢复 enterprise automation 栈） | M | M3-07 非硬依赖 |
| M3-09 | 用量 token/费用（jsonl `message.usage` 聚合） | M | jsonl 抽样 |
| — | Dock 运行指示（原 M3-07） | S | backlog，同 M2-G |

---

## 实施顺序（v2.0.0，对齐 M2）

```
Pre-flight
 │
 ├─► M3-03 远程白话 (S)
 ├─► M3-05 导出 HTML (S)     ─┐ 先还 M1/M2 欠账 + 低风险
 ├─► M3-02 插入技能 (S)      │
 └─► M3-01 命令面板 (M)      ─┘
 │
 ▼
 M3-04 用量简版 (M)
 │
 └─► M3-06 文档 + test:m3 (S)
```

v2.0.1：Pre-flight `m3-design.md` → M3-07 → M3-08 → M3-09

---

## Pre-flight（编码前必做）

- [x] `get_commands`：dev 会话调用成功，结果写入 `m3-preflight` fixture 或测试
- [x] `switch_session`：附录 A 已写入 [m3-design.md](./m3-design.md)（A/B 选型）；v2.0.1 前仍需 1 天 spike 验证
- [ ] jsonl 抽样 10 文件：记录是否含 `message.usage`（仅影响 v2.0.1 M3-09）
- [ ] 产品确认：v2.0.0 **不做**一键自动化（避免恢复四场景门户）
- [ ] pi 包版本 ≥ 含 `get_commands` 的 `@earendil-works/pi-coding-agent`

---

## 明确 backlog（不进 v2.0.0 / v2.0.1 亦可继续延后）

| 项 | 来源 | 原因 |
|----|------|------|
| M2-C `queue_update` + steering 模式 UI | M2 | 与 M3-01 无关则不做 |
| M2-E 工具三档 | M2 | M1 简洁已够 |
| 历史全文搜索 | M2-F | 非阻塞 |
| Sparkle / Dock | M2-G | 非阻塞 |
| 扩展管理 UI | M4 | 见 m4-checklist |
| 团队模板云同步 | — | M4 |
| 恢复四场景企业门户 | M1 | 明确不做 |

---

## 建议 GitHub Issues（修订）

**v2.0.0**

1. `M3-01 feat: slash commands (advanced only)`
2. `M3-02 feat: insert skill into chat input`
3. `M3-03 polish: remote access plain-language wizard`
4. `M3-04 feat: 7-day session activity chart`
5. `M3-05 feat: export conversation HTML`
6. `M3-06 docs: advanced guide + test:m3`

**v2.0.1**

7. `M3-07 feat: multi-session tabs`
8. `M3-08 feat: user templates + one-click run`
9. `M3-09 feat: token usage aggregation`

---

## 进度记录

| 日期 | 说明 |
|------|------|
| 2026-06-03 | 清单创建，与总计划 M3 对齐 |
| 2026-06-03 | 对齐 product-principles |
| 2026-06-04 | **重规划**：对照代码库；M3-01～08 |
| 2026-06-04 | **对照 M1/M2 再审**：里程碑缩为 **M3-01～06**；Tab/自动化/Dock 移 v2.0.1/backlog；导出单列 M3-05；里程碑去掉「场景动作」 |
| 2026-06-04 | [m3-design.md](./m3-design.md) 设计稿 |
| 2026-06-04 | M3-01～06 实现；`test:m3` + vitest |
