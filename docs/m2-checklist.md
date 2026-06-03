# M2 验收清单 — 日常办公够用（v1.1–v1.2）

**目标**：长对话稳定、分支与会话资产可管理，明显强于普通单线程 Chat。  
**周期**：约 4–6 周（M1 完成后）  
**总计划**：[plan-pi-web-macos-workbench.md](./plan-pi-web-macos-workbench.md)  
**前置**：[m1-checklist.md](./m1-checklist.md) 里程碑验收已全部通过  
**其它里程碑**：[M1](./m1-checklist.md) · [M3](./m3-checklist.md) · [M4](./m4-checklist.md)

**贯穿原则**：[product-principles.md](./product-principles.md)（凭据/工作区/壳/实现简单，全阶段适用）

---

## 里程碑验收（必须全部通过）

- [ ] 分支切换时可选择「先总结之前内容」并成功切换
- [ ] 「从这里另开一版」（Fork）与「复制为新对话」（Clone）文案与行为对用户清晰可区分
- [ ] 会话标题可编辑，且在侧栏列表中持久展示
- [ ] 对话时间线中可见「整理对话」压缩节点及摘要
- [ ] 在 CLI 与 App 共用同一 `cwd` 时，侧栏/终端均能看到对方创建的会话（`~/.pi/agent/sessions/`）

---

## M2-A — 会话标题与元数据

| ID | 任务 | 完成 |
|----|------|------|
| PI-05 | `rpc-manager` 接线 `set_session_name`（若尚未透传） | [ ] |
| — | 顶栏 / 侧栏支持编辑会话标题 | [ ] |
| — | 与现有 `PATCH /api/sessions/[id]` 行为一致，避免双源冲突 | [ ] |
| — | 重命名后 `refreshKey` 刷新列表 | [ ] |
| — | i18n：重命名占位、错误提示 | [ ] |

**模块**：`SessionSidebar`、`AppShell`、`app/api/sessions/[id]/route.ts`、`lib/rpc-manager.ts`

---

## M2-B — 分支、Fork、Clone

| ID | 任务 | 完成 |
|----|------|------|
| PI-06 | `navigate_tree` 支持 `summarize` + `customInstructions` 参数 | [ ] |
| PI-06 | 分支切换 UI：可选「先总结」、自定义说明（白话） | [ ] |
| PI-07 | `rpc-manager` 接线 `clone` | [ ] |
| PI-07 | 「复制当前进度为新对话」入口（分支导航或菜单） | [ ] |
| — | Fork 文案统一为「从这里另开一版」（`MessageView` 等） | [ ] |
| — | Clone 成功后跳转新会话并刷新侧栏 | [ ] |
| — | 扩展测试：`navigate_tree` summarize、`clone` RPC | [ ] |

**模块**：`BranchNavigator`、`MessageView`、`lib/rpc-manager.ts`、`hooks/useAgentSession.ts`

---

## M2-C — 消息队列与投递模式

| ID | 任务 | 完成 |
|----|------|------|
| PI-08 | `rpc-manager` 接线 `set_steering_mode` | [ ] |
| PI-08 | `rpc-manager` 接线 `set_follow_up_mode` | [ ] |
| — | 设置页：中途改方向 —「一次一条 / 全部」 | [ ] |
| — | 设置页：完成后补充 —「一次一条 / 全部」 | [ ] |
| PI-09 | 订阅 SSE `queue_update` | [ ] |
| PI-09 | 输入栏上方显示「已排队 N 条说明」（steer / follow-up 分开展示更佳） | [ ] |
| — | 与现有 Steer / Follow-up 按钮行为一致 | [ ] |

**模块**：`ChatInput`、`useAgentSession.ts`、`WorkbenchSettings.tsx`、`lib/rpc-manager.ts`

---

## M2-D — 压缩时间线

| ID | 任务 | 完成 |
|----|------|------|
| PI-15 | 读取 jsonl 中 `compaction` 条目并在消息列表渲染 | [ ] |
| — | 压缩块样式与 pi TUI 语义一致（摘要 + tokensBefore 可选） | [ ] |
| — | 与 `session-reader` / `buildSessionContext` 中 compaction 逻辑对齐 | [ ] |
| — | 切换分支后压缩节点位置正确 | [ ] |

**模块**：`MessageView`、`lib/session-reader.ts`、`lib/types.ts`

---

## M2-E — 工具模式（标准 / 高级）

| ID | 任务 | 完成 |
|----|------|------|
| PI-10 | 高级模式：`get_tools` 列表 + 逐项 `set_tools` 勾选 UI | [ ] |
| PR-02 | 三档明确：简洁 / 标准（低·高预设）/ 高级（逐项） | [ ] |
| — | 设置中记住用户工具模式偏好（`pi-web-preferences.json`，不新建凭据存储） | [ ] |
| — | 新会话创建时应用当前工具配置 | [ ] |

**模块**：`ToolPanel`、`ChatInput`、`hooks/useAgentSession.ts`

---

## M2-F — 历史、用量、场景模板入口

| ID | 任务 | 完成 |
|----|------|------|
| PR-04 | 增强 `WorkbenchHistory`（筛选、排序若需要） | [ ] |
| PR-04 | `/api/usage` 数据在设置或历史中更易读（非原始 JSON） | [ ] |
| — | 场景卡片增加「常用模板 / 最近场景」快捷入口 | [ ] |
| — | 从场景配置页返回后 Workbench 缓存失效正确 | [ ] |

**模块**：`WorkbenchHistory.tsx`、`WorkbenchHome.tsx`、`app/api/usage/route.ts`、`lib/usage.ts`

---

## M2-G — macOS 壳增强

在 M1 **薄壳**（`bin/pi-web.js` + WKWebView）上增强；**不**引入 Electron/Tauri。

| ID | 任务 | 完成 |
|----|------|------|
| PL-07 | App 自动更新（Sparkle 或等价方案） | [ ] |
| PL-08 | Dock 图标：运行中任务指示（可选 badge） | [ ] |
| PL-08 | 菜单栏：空闲 / 运行中 / 需登录 状态 | [ ] |
| — | 关于页显示 pi-web + pi-coding-agent 版本号 | [ ] |

**模块**：macOS 壳仓库

---

## 交付物

- [ ] v1.1 发布说明：分支、Clone、会话标题、压缩时间线
- [ ] 更新用户文档「管理对话与分支」小节

---

## 建议 Issue（M2 范围）

1. `feat: session title edit (set_session_name)`
2. `feat: navigate_tree summarize dialog`
3. `feat: clone session RPC + UI`
4. `feat: queue_update UI + steering/follow-up mode settings`
5. `feat: compaction timeline in message list`
6. `feat: advanced per-tool toggle (get_tools/set_tools)`
7. `feat: tool mode simple / standard / advanced`
8. `enhance: workbench history and usage display`
9. `chore: macOS auto-update and dock status`

---

## 进度记录

| 日期 | 说明 |
|------|------|
| 2026-06-03 | 清单创建，与总计划 M2 对齐 |
| 2026-06-03 | 对齐 [product-principles.md](./product-principles.md) |
