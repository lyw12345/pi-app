# M3 验收清单 — 强于普通 Chat（v2.0）

**目标**：进阶用户与轻度团队场景 — 命令、多会话、自动化、远程白话化、用量可视化。  
**周期**：约 6–8 周（M2 完成后）  
**总计划**：[plan-pi-web-macos-workbench.md](./plan-pi-web-macos-workbench.md)  
**前置**：[m2-checklist.md](./m2-checklist.md) 里程碑验收已全部通过  
**其它里程碑**：[M1](./m1-checklist.md) · [M2](./m2-checklist.md) · [M4](./m4-checklist.md)

**贯穿原则**：[product-principles.md](./product-principles.md)（凭据/工作区/壳/实现简单，全阶段适用）

---

## 里程碑验收（必须全部通过）

- [ ] 输入 `/` 可补全并执行 pi 内置/扩展命令（`get_commands`）
- [ ] Skills / 模板可通过按钮插入，无需记忆 `/skill:name`
- [ ] 多会话 Tab 切换无明显状态错乱（`switch_session` 或等价方案）
- [ ] 至少一种自动化方式可一键跑场景并产生会话记录
- [ ] 远程访问默认关闭；开启流程为白话向导，非技术用户可理解
- [ ] 用量可按时间或场景查看图表/汇总

---

## M3-A — 命令面板（`/`）

| ID | 任务 | 完成 |
|----|------|------|
| PI-11 | `rpc-manager` / agent API 接线 `get_commands` | [ ] |
| — | `ChatInput` 输入 `/` 弹出命令列表（内置 + 扩展） | [ ] |
| — | 选择命令后以 `prompt` 发送（扩展命令规则见 pi rpc.md） | [ ] |
| — | 流式中扩展命令与 steer 行为符合 pi 文档 | [ ] |
| — | 默认用户可在设置中隐藏命令面板 | [ ] |
| — | 命令描述 i18n 或原文 fallback | [ ] |

**模块**：`ChatInput`、新 `CommandPalette`（可选）、`lib/rpc-manager.ts`

---

## M3-B — Skills 与模板产品化

数据仍落在 `~/.pi/agent` 既有路径（skills、scene-overrides），与 CLI 目录一致。

| ID | 任务 | 完成 |
|----|------|------|
| PI-12 | 聊天工具栏「插入技能」：列表已安装 skills | [ ] |
| PI-12 | 点击插入等价于 `/skill:name` 展开（不强制用户记语法） | [ ] |
| — | 场景页「保存为我的模板」：写入 scene-overrides 或元数据 | [ ] |
| — | 模板列表：个人 / 团队（团队若仅本地 JSON 需文档说明） | [ ] |
| — | 与 `SkillsConfig`、`scene-overrides` API 一致 | [ ] |

**模块**：`SkillsConfig.tsx`、`WorkbenchHome.tsx`、`SceneConfigEditor`、`lib/scenes.ts`

---

## M3-C — 多会话 Tab

仍使用单一 `~/.pi/agent`；不复制 agent 目录或独立凭据。

| ID | 任务 | 完成 |
|----|------|------|
| PI-14 | 评估 `switch_session` 与当前 `rpc-manager` 单例模型 | [ ] |
| PI-14 | 实现 Tab：每 Tab 一个 sessionId + 独立 SSE 或切换时重连 | [ ] |
| — | 关闭 Tab 时销毁或 idle 对应 `AgentSessionWrapper` | [ ] |
| — | URL 与 Tab 状态同步（`?session=`） | [ ] |
| — | 新建 Tab = 新会话 / 从侧栏打开 | [ ] |
| — | 内存与并发会话数上限策略 | [ ] |

**模块**：`AppShell`、`TabBar`、`lib/rpc-manager.ts`（可能较大改）

---

## M3-D — 自动化

| ID | 任务 | 完成 |
|----|------|------|
| PR-05 | 梳理 `lib/automation.ts` 与 `/api/automation` 现有能力 | [ ] |
| — | UI：选择场景 + 输入参数 +「立即运行」 | [ ] |
| — | 可选：定时触发（macOS 壳 launchd / 仅文档级亦可后置） | [ ] |
| — | 运行结果写入历史 / 通知 | [ ] |
| — | 非技术用户白话文案（非「RPC prompt」） | [ ] |

**模块**：`app/api/automation/`、`WorkbenchSettings` 或独立 `AutomationPanel`

---

## M3-E — 远程访问白话化

对齐 [product-principles.md](./product-principles.md) §1：远程默认关，仅高级入口 + 白话向导。

| ID | 任务 | 完成 |
|----|------|------|
| PR-03 | 远程默认关闭；高级设置单独入口 | [ ] |
| — | 文案替换：配对设备、手机查看进度、只读模式（非 token/relay） | [ ] |
| — | 开启向导：风险提示 + QR 配对步骤 | [ ] |
| — | 与 [remote-access.md](./remote-access.md) 技术文档交叉链接 | [ ] |
| — | 审计日志入口（`GET /api/remote/audit`）对管理员可见 | [ ] |

**模块**：`RemoteAccessSettings.tsx`、`RemotePairingHandler.tsx`、`docs/remote-access.md`

---

## M3-F — 用量图表

| ID | 任务 | 完成 |
|----|------|------|
| — | 基于 `/api/usage` + session 元数据做时间序列 | [ ] |
| — | 图表：按日 token/费用；按场景占比 | [ ] |
| — | 按模型拆分（若 stats 可得） | [ ] |
| — | 导出 CSV 可选 | [ ] |
| — | 性能：大量会话时聚合不阻塞 UI | [ ] |

**模块**：`lib/usage.ts`、`WorkbenchSettings` 或新 `UsageDashboard`

---

## 交付物

- [ ] v2.0 发布说明：命令面板、多 Tab、自动化、远程向导
- [ ] 「进阶功能」用户文档 1 页

---

## 建议 Issue（M3 范围）

1. `feat: slash command palette (get_commands)`
2. `feat: skill and template insert buttons in chat`
3. `feat: save scene as user template`
4. `feat: multi-session tabs (switch_session)`
5. `feat: automation run UI for scenes`
6. `feat: remote access plain-language wizard`
7. `feat: usage charts by day and scene`
8. `docs: advanced features guide`

---

## 进度记录

| 日期 | 说明 |
|------|------|
| 2026-06-03 | 清单创建，与总计划 M3 对齐 |
| 2026-06-03 | 对齐 [product-principles.md](./product-principles.md) |
