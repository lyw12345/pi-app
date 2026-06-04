# M2 验收清单 — 日常办公够用（v1.1）

> **与总计划关系**：执行 scope 以本清单为准。[plan-pi-web-macos-workbench.md](./plan-pi-web-macos-workbench.md) § Milestone 2 仍列 M2-C～G 七包；v1.1 仅做本清单 **M2-01～06**，其余见下方 backlog。

**目标（一段）**：让默认用户在长对话里能**找得到会话、看得懂分支与整理**——分支切换可选先总结、Fork/Clone 各一句人话、整理后在时间线可见摘要；不新增第二套设置心智（队列模式、工具三档、用量大盘等延后）。

**周期**：约 3–4 周（M1 pi-web 可交付项完成后）  
**总计划**：[plan-pi-web-macos-workbench.md](./plan-pi-web-macos-workbench.md)  
**前置**：[m1-checklist.md](./m1-checklist.md) pi-web 功能项通过；M1 里程碑「免 Node 首对话」发布前收口  
**原则**：[product-principles.md](./product-principles.md) §1 功能门禁

---

## 里程碑验收（精简，须全部通过）

- [x] 切换分支时可选「切换前先总结」（**默认关**；无自定义说明长文本框）
- [x] Fork（「从这里另开一版」）与 Clone（「复制为新对话」）**各一个入口**，用户能分清
- [x] 侧栏可改会话标题，列表持久显示（`PATCH /api/sessions/[id]` 为唯一写路径）
- [x] 自动/手动整理后，时间线有白话「已整理」摘要块（不展示 tokens 等技术字段）
- [x] 同一工作区 App 与 CLI 看到同一批会话文件（回归，非新功能）

---

## 工作项（v1.1，M2-01～06）

### M2-01 — 分支切换可选「先总结」

| 字段 | 内容 |
|------|------|
| **门禁：用户真的需要吗？** | 是。多分支长对话切换会丢被放弃分支的上下文；默认关，仅 BranchNavigator 用户主动勾选。 |
| **门禁：能否更简单？** | 是。一个勾选 + RPC 透传 `summarize: true`；不做 `customInstructions` / 替换提示词 UI。 |
| **Scope IN** | `rpc-manager` `navigate_tree` 透传 `summarize`；`useAgentSession.handleLeafChange` 读偏好；`BranchNavigator` 勾选（默认关，可存 `pi-web-preferences.json`）；切换后 reload context/tree。 |
| **Scope OUT** | 分支摘要自定义说明；`branch_summary` 独立复杂编辑器；navigate 时 `label` 字段 UI。 |
| **验收** | 勾选后切换分支，jsonl 出现 branch 摘要且时间线可见（见 M2-03）；不勾选行为与现网一致；无模型时给出白话错误。 |
| **主要文件** | `lib/rpc-manager.ts`、`hooks/useAgentSession.ts`、`components/BranchNavigator.tsx`、`lib/pi-web-preferences.ts` |
| **依赖** | Pre-flight 验证 `AgentSession.navigateTree(..., { summarize: true })` |
| **体量** | M |
| **完成** | [x] |

---

### M2-02 — Clone + Fork 文案与入口

| 字段 | 内容 |
|------|------|
| **门禁：用户真的需要吗？** | 是。Fork 已有但文案像「新建会话」；Clone（整段复制另开）pi 有 RPC、web 未接。 |
| **门禁：能否更简单？** | 是。Fork 保留在用户消息上；Clone 一个入口（会话菜单或顶栏「⋯」），两句 i18n，不合并为同一按钮。 |
| **Scope IN** | `rpc-manager` 新增 `clone`（`createBranchedSession(leafId)`，返回 `newSessionId`，destroy wrapper，同 fork）；Clone UI；Fork/Clone i18n 统一；成功后 `?session=` 跳转 + 侧栏 `refreshKey`。 |
| **Scope OUT** | 第三种「分支」操作；Clone 后留在原会话；批量复制。 |
| **验收** | Fork 从某条用户消息另开独立 jsonl（子会话树可见）；Clone 复制当前路径为新 jsonl；两操作成功后列表刷新且打开新会话。 |
| **主要文件** | `lib/rpc-manager.ts`、`hooks/useAgentSession.ts`、`components/MessageView.tsx`、`components/AppShell.tsx`、`lib/i18n/messages/*.ts` |
| **依赖** | M2-01 非硬依赖；Pre-flight 验证 `createBranchedSession(getLeafId())` |
| **体量** | M |
| **完成** | [x] |

---

### M2-03 — 整理/压缩摘要块（时间线可见）

| 字段 | 内容 |
|------|------|
| **门禁：用户真的需要吗？** | 是。自动整理默认开（M1），用户需看见「发生了什么」才信任。 |
| **门禁：能否更简单？** | 是。专用折叠块一行摘要 + 展开全文；不展示 `tokensBefore`、不做 TUI 复刻。 |
| **Scope IN** | `MessageView` 识别 compaction 摘要（保留 `session-reader` 映射或改传 `role` 标记）；`branch_summary` 同类样式；i18n 前缀（去掉 `session-reader` 硬编码英文）；手动整理后 SSE 结束已有 `loadSession` 回归。 |
| **Scope OUT** | tokens 图表；多条 compaction 时间轴动画；hook 详情 `details`。 |
| **验收** | 自动/手动 compact 后时间线出现白话「已整理」块；zh-CN/en 无硬编码；与 `session-reader.test.ts` 行为一致。 |
| **主要文件** | `components/MessageView.tsx`、`lib/session-reader.ts`、`lib/i18n/messages/*.ts` |
| **依赖** | 无（可与 M2-01 并行；M2-01 的 branch 摘要复用本样式） |
| **体量** | M |
| **完成** | [x] |

---

### M2-04 — 会话标题单一写路径（收口）

| 字段 | 内容 |
|------|------|
| **门禁：用户真的需要吗？** | 是。侧栏找会话是 M2 核心场景。 |
| **门禁：能否更简单？** | 是。侧栏重命名已存在；只做审计 + 顶栏显示 `session.name`，不新增 RPC `set_session_name` 双写。 |
| **Scope IN** | 确认仅 `PATCH /api/sessions/[id]` → `appendSessionInfo`；聊天顶栏或 Tab 显示重命名后标题；重命名触发 `refreshKey`（已有则回归）。 |
| **Scope OUT** | 顶栏内联编辑（与侧栏重复）；`scene-metadata` 产品标题双轨。 |
| **验收** | 侧栏改名后列表与顶栏一致；刷新后仍显示；无第二写路径。 |
| **主要文件** | `components/SessionSidebar.tsx`、`components/AppShell.tsx` 或 `ChatWindow.tsx`、`app/api/sessions/[id]/route.ts` |
| **依赖** | 无 |
| **体量** | S |
| **完成** | [x] |

---

### M2-05 — 关于 / 版本（最小）

| 字段 | 内容 |
|------|------|
| **门禁：用户真的需要吗？** | 是。支持排障「你用的是哪一版」。 |
| **门禁：能否更简单？** | 是。设置页一段：`pi-web` + `pi-coding-agent` 版本（已有 `NEXT_PUBLIC_*`）；不阻塞 M2 其它项。 |
| **Scope IN** | `WorkbenchSettings`「关于」区块；复用 `next.config.ts` 注入版本；macOS 菜单「关于 Pi」可选链到同页或静态文案。 |
| **Scope OUT** | Sparkle 自动更新（M3+）；Dock badge。 |
| **验收** | 设置页可见两版本号，与 `GET /api/health` / 包版本一致。 |
| **主要文件** | `components/WorkbenchSettings.tsx`、`lib/i18n/messages/*.ts` |
| **依赖** | 无 |
| **体量** | S |
| **完成** | [x] |

---

### M2-06 — 交付与回归

| 字段 | 内容 |
|------|------|
| **Scope IN** | v1.1 发布说明；用户文档「管理对话与分支」一页（白话，无 RPC 术语）；[CLI/App 会话回归](./regression-cli-app-sessions.md)。 |
| **验收** | 文档可独立阅读；同 `cwd` 下 `pi` 与 pi-web 列表一致。 |
| **体量** | S |
| **完成** | [x] |

---

## 实施顺序

```
Pre-flight（手动）
 │
 ├─► M2-04 标题收口 (S)
 ├─► M2-03 整理摘要块 (M) ─┐ 可并行
 │                         │
 └─► M2-01 分支总结 (M) ◄──┘
 │
 ▼
 M2-02 Clone + Fork 文案 (M)
 │
 ├─► M2-05 关于 (S)
 └─► M2-06 文档 + 回归 (S)
```

---

## Pre-flight（编码前必做）

- [x] `rpc-manager` 已透传 `navigate_tree.summarize` 与 `clone` RPC
- [x] `clone` 使用 `createBranchedSession(leafId)`（与 pi RPC 一致）
- [x] 分支总结：`npm run test:m2`（设 `PI_M2_TEST_SUMMARIZE=1` 会调用模型并断言时间线 `timelineSummary` branch）
- [x] Clone / Fork：`npm run test:m2` 断言 `newSessionId`、`GET /api/sessions` 列表可见（与 UI `fetchSessionInfo` + `refreshKey` 同源）

本地复现（需 `npm run dev` 在 30142）：

```bash
npm run test:m2
PI_M2_TEST_SUMMARIZE=1 npm run test:m2
```

macOS 壳：`npm run package:macos` 后重装 `Pi.app`，在 UI 再点一次 Fork/Clone/分支勾选作最终确认。

---

## 明确 backlog（M3+）

| 项 | 延后原因 |
|----|----------|
| M2-C 队列模式 + `queue_update` UI | Steer/Follow-up 已够用；第二套「一次/全部」心智 |
| M2-E 工具三档 + 逐项勾选 | M1 简洁 + 高级已覆盖 |
| M2-F 历史搜索 / 用量大盘 | 首页最近 + 顶栏悬停用量已够 M2 |
| M2-G Sparkle / Dock / 菜单栏状态 | 壳锦上添花，非 v1.1 阻塞 |
| HTML 导出入口 | M1 RPC 已有；需要时单按钮，不扩 M2 |
| 分支总结自定义说明 | 违反「能否更简单」 |
| 场景卡片 / Scenes | M1 已移除 |

---

## 建议 GitHub Issues

1. `M2-01 feat: branch switch optional summarize`
2. `M2-02 feat: clone session + fork/clone copy`
3. `M2-03 feat: compaction timeline block (i18n)`
4. `M2-04 chore: session title single write path + header`
5. `M2-05 chore: about page versions`
6. `M2-06 docs: branch guide + v1.1 release notes`

---

## 进度记录

| 日期 | 说明 |
|------|------|
| 2026-06-03 | 清单创建，与总计划 M2 对齐 |
| 2026-06-03 | 对齐 product-principles |
| 2026-06-04 | 增加功能门禁；M2 scope 精简 |
| 2026-06-04 | **重规划**：对照代码库（无 clone RPC、navigate 未透传 summarize、compaction 英文假 user 消息）；工作项改为 M2-01～06；总计划 M2-C～G 降为 backlog |
| 2026-06-04 | **实现**：M2-01～06 代码与文档落地 |
| 2026-06-04 | **收口**：流式摘要 `normalizeAgentMessage`、Fork/Clone 后 `fetchSessionInfo`、分支切换 loading、i18n 错误、单元测试、macOS「关于 Pi」、`/api/health` piVersion、README/用户指南/CLI 回归文档 |
| 2026-06-04 | **Pre-flight 自动化**：`scripts/m2-preflight.mjs` + `npm run test:m2`（含 summarize 可选）；清理误生成 `Users/` |
