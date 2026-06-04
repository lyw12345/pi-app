# M4 验收清单 — 平台化（v2.x+，按需）

> **与总计划关系**：执行 scope 以本清单为准。[plan-pi-web-macos-workbench.md](./plan-pi-web-macos-workbench.md) § Milestone 4 仅列方向；**v2.1.0 先做 M4-01～03**，团队云同步（M4-04）与运维包（M4-D）立项后再排。

**目标（一段）**：在**不破坏 M1–M3 默认路径**的前提下，补齐「扩展可见、结果可分享、场景可搬运」三类平台能力——全部默认关或走高级入口；含后端/共享存储的项必须先过 spike + 技术方案评审。

**周期（粗估）**：v2.1.0 约 4–6 周（M4-01～03）；v2.2+ 视 spike 结果  
**总计划**：[plan-pi-web-macos-workbench.md](./plan-pi-web-macos-workbench.md)  
**前置**：[m3-checklist.md](./m3-checklist.md) 里程碑与 `npm run test:m3` 已通过  
**原则**：[product-principles.md](./product-principles.md) §1 功能门禁

---

## 里程碑验收（v2.1.0，须全部通过 — M4-01～03）

- [ ] **高级模式 / 设置**内可浏览已安装扩展（路径、启用状态、错误信息）；**不提供**在线编写 TS
- [ ] 场景配置可 **导出 / 导入 JSON 包**（含 override 字段）；导入前预览 diff，冲突可取消
- [ ] 至少一种 **只读分享**可用：会话 HTML 导出（已有）+ **分享链接向导**（静态文件或只读远程二选一，见 M4-03 spike）
- [ ] 默认用户路径不变：简洁工具、远程默认关、`auth.json` 与 CLI 共用、无第二套 OAuth

> **不在 v2.1.0 里程碑内**：团队 Git 同步、中心服务端、扩展在线 IDE、Gist `/share`、Bash 面板 — 见 v2.2+ / backlog。

---

## 对照 M3 的评审结论（规划基线）

| 维度 | M3 v2.0 | **M4 v2.1 建议** |
|------|---------|------------------|
| 里程碑内项数 | 6 项（01～06） | **3 项**（01～03）+ spike 门控 |
| 默认用户 | 无 `/`、无 System 顶栏 | 扩展/分享/导入 **不进首页** |
| 数据边界 | 单用户 `~/.pi/agent` | 仍单用户；团队同步 **另立项** |
| 壳依赖 | 无 | v2.1 pi-web 可独立交付；企业部署文档可并行 |

**否决 / 延后项（门禁未过）**

| 项 | 理由 |
|----|------|
| 扩展在线编辑器 | 安全与维护成本；链 pi `extensions.md` 即可 |
| 默认开只读远程 | 违反 product-principles §3 |
| 团队云同步进 v2.1 | 需 spike 选型；M4-02 JSON 包已覆盖「手动搬运」 |
| Gist `/share` | 总计划明确不做；HTML 导出 + 本地托管替代 |
| 扩展 custom UI（`ctx.ui.custom`） | 长期项，需 Web 扩展协议 |

---

## 代码库现状（规划基线）

| 能力 | 现状 | v2.1.0 | v2.2+ |
|------|------|--------|-------|
| 扩展发现 | pi 有 loader / `settings.json` paths；**无** web RPC 列表 | M4-01 spike → UI | 启用/禁用若上游支持 |
| `get_commands` | M3 已接 | M4-01 与扩展列表对齐白名单 | — |
| `scene-overrides.json` | 有 CRUD API + 设置页编辑 | M4-02 导入/导出 | M4-04 团队同步 |
| `export_html` | RPC + 下载 route 已有（M3-05） | M4-03 分享向导包装 | — |
| `PI_WEB_REMOTE_READ_ONLY` | 后端 + 设置勾选已有 | M4-03 产品化「只读围观」 |  per-session 链接 |
| 远程审计 | `pi-web-remote-audit.jsonl` | M4-03 分享打开记录 | — |
| `/api/automation` | 占位 | — | PR-05 若需求成立 |

---

## Pre-flight（立项前必须完成，阻塞 M4-01～03 开发）

| ID | Spike | 产出 | 阻塞 | 状态 |
|----|-------|------|------|------|
| SP-01 | pi 扩展列表：读 `settings.json` extension paths + 扫描 `~/.pi/agent/extensions`、项目 `.pi/extensions` | 是否需上游 `get_extensions` RPC；字段 schema | M4-01 | [x] 结论：无需上游 RPC；服务端 `discoverAndLoadExtensions` + `PackageManager.resolve()` → [m4-design.md](./m4-design.md) § SP-01 |
| SP-02 | 只读分享选型：A) 导出 HTML + 打开说明 B) 只读 remote + 单会话 deep link C) 局域网围观 | [m4-design.md](./m4-design.md) § 分享 1 页 | M4-03 | [x] 结论：A 为主 + B 进阶；不做单会话 deep link → § SP-02 |
| SP-03 | 场景包 JSON schema：`scenes` 静态 id + `scene-overrides` 字段边界 | schema 文档 + 样例文件 | M4-02 | [x] `schemaVersion: 1` + [fixtures/m4-scene-pack-v1.example.json](./fixtures/m4-scene-pack-v1.example.json) → § SP-03 |

> **立项门禁**：Pre-flight 三项已完成；**可开 M4-01～03 开发**（建议仍先过 [m4-design.md](./m4-design.md) 评审签字）。

---

## 工作项（v2.1.0，M4-01～03）

### M4-01 — 扩展目录浏览（只读）

| 字段 | 内容 |
|------|------|
| **门禁：用户真的需要吗？** | 进阶用户装扩展后需知「加载了什么、是否报错」；默认用户不需要。 |
| **门禁：能否更简单？** | 是。只读列表 + 链文档；不做 IDE、不做 `/reload` RPC（提示重启 App/服务）。 |
| **Scope IN** | 新 `ExtensionsSettings`（设置 → 高级）；`GET /api/extensions` 聚合 agent + project 路径；展示 name/path/enabled/error；i18n；链 [pi extensions.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)。 |
| **Scope OUT** | 在线编辑 TS；npm 安装扩展；扩展市场。 |
| **验收** | 与 pi CLI 同目录下扩展数量一致；加载错误可见；默认设置页无入口（仅高级）。 |
| **主要文件** | 新 `app/api/extensions/route.ts`、`components/ExtensionsSettings.tsx`、`lib/extensions-reader.ts`（或复用 pi 包 API 若 SP-01 通过） |
| **依赖** | SP-01；M3-01 命令白名单策略与扩展命令列表对齐 |
| **体量** | M |
| **完成** | [ ] |

---

### M4-02 — 场景包导入 / 导出

| 字段 | 内容 |
|------|------|
| **门禁：用户真的需要吗？** | 轻度团队/多机需搬运场景 override；无服务端时的最低可行同步。 |
| **门禁：能否更简单？** | 是。单 JSON 文件 import/export；冲突 = 覆盖前确认。 |
| **Scope IN** | `GET /api/scene-overrides/export`（或客户端组包）；`POST /api/scene-overrides/import` 带 preview；WorkbenchSettings 或场景编辑页按钮；schema 版本字段 `version: 1`；i18n。 |
| **Scope OUT** | Git 自动 sync；多角色权限；场景 marketplace。 |
| **验收** | 导出 → 另一实例导入 → launch 场景行为一致；非法 JSON 白话错误；不覆盖未确认。 |
| **主要文件** | `lib/scene-overrides.ts`、`app/api/scene-overrides/*`、`components/SceneConfigEditor.tsx` 或 Settings |
| **依赖** | SP-03 |
| **体量** | M |
| **完成** | [ ] |

---

### M4-03 — 只读分享（产品化）

| 字段 | 内容 |
|------|------|
| **门禁：用户真的需要吗？** | 需把对话结果给他人「看」而非「改」；导出 HTML 已有，缺白话路径。 |
| **门禁：能否更简单？** | 是。v2.1 **优先**「导出 HTML + 分享步骤说明」；若 SP-02 选 B，加只读 remote 勾选与单会话链接（不新协议）。 |
| **Scope IN** | 聊天或设置「分享此对话」向导：导出 / 复制说明；路径与 API key 脱敏（HTML 导出内容 audit）；只读 remote 与 `readOnly` 设置联动文案；审计日志条目（可选）。 |
| **Scope OUT** | 公网托管；Gist；写权限分享。 |
| **验收** | 分享物不含 `auth.json`、完整 API key、绝对 home 路径（可配置替换为 `~`）；只读设备无法 POST 变更会话。 |
| **主要文件** | `ChatWindow` 或菜单、`lib/remote-auth.ts`、`RemoteAccessSettings.tsx`、export route |
| **依赖** | SP-02；M3-05 export 已闭合 |
| **体量** | S～M（视 SP-02 分支） |
| **完成** | [ ] |

---

## 工作项（v2.2+ / 立项后）

### M4-04 — 团队场景同步

| 字段 | 内容 |
|------|------|
| **门禁** | 需真实团队试点；M4-02 手动包不够时再上。 |
| **Scope IN** | 同步载体三选一（共享目录 / Git 仓库 / 轻量 HTTP）；watch 或手动 pull；冲突策略文档化。 |
| **依赖** | M4-02 schema；独立 PRD |
| **体量** | L |
| **完成** | [ ] |

### M4-05 — 扩展启用 / 禁用（若 pi 上游支持）

| 字段 | 内容 |
|------|------|
| **Scope IN** | 在 M4-01 列表上增加 toggle；写 `settings.json`；提示重启。 |
| **依赖** | pi RPC 或 documented settings API |
| **体量** | M |
| **完成** | [ ] |

### M4-06 — 多 Tab / `switch_session`（M3 backlog 回收）

| 字段 | 内容 |
|------|------|
| **说明** | 原 M3-07；与 M4 平台化相关但**非** v2.1 必做。 |
| **依赖** | `rpc-manager` 多实例或 switch RPC spike |
| **体量** | L |
| **完成** | [ ] |

---

## M4-D — 平台运维与合规（可选，企业立项）

| ID | 任务 | 完成 |
|----|------|------|
| M4-D1 | 企业部署指南：`PI_CODING_AGENT_DIR`、禁用远程、30141/30142 隔离 | [ ] |
| M4-D2 | 可选错误上报（opt-in，无会话内容） | [ ] |
| M4-D3 | 会话保留 / 归档向导（批量导出或删除） | [ ] |
| M4-D4 | 同机多 macOS 用户配置隔离说明 | [ ] |

---

## M4-E — pi 上游 backlog（不阻塞 v2.1）

| 能力 | 说明 | 完成 |
|------|------|------|
| `bash` 面板 | 仅企业高级 + 安全评审 | [ ] |
| Gist `/share` | 不做；用 HTML + 只读 remote | [ ] |
| JSON / print 模式 | 集成用，非 App 主 UI | [ ] |
| 扩展 Web UI 协议 | 长期 | [ ] |

---

## 建议实施顺序（pi-web 仓库）

```
SP-01 / SP-02 / SP-03（并行，1 周）
  → m4-design.md 评审签字
  → M4-02 场景包（无 pi 上游依赖，可先 ship）
  → M4-01 扩展列表（依赖 SP-01）
  → M4-03 分享向导（依赖 SP-02）
  → npm run test:m4（新建，仿 test:m3）
  → v2.1.0 发布说明
```

---

## 交付物

- [x] [m4-design.md](./m4-design.md)（扩展 / 分享 / 场景包各 1 节，SP 完成后写）
- [ ] `scripts/m4-preflight.mjs` + `npm run test:m4`
- [ ] v2.1.0 发布说明（按实际立项子集）

---

## 建议 Issue（立项后创建）

1. `spike: pi extension list for pi-web`
2. `spike: read-only session sharing options`
3. `feat: scene pack import/export`
4. `feat: extensions directory browser (read-only)`
5. `feat: share conversation wizard`
6. `docs: enterprise deployment guide`（M4-D1）

---

## 进度记录

| 日期 | 说明 |
|------|------|
| 2026-06-03 | 清单创建，M4 为方向性 backlog |
| 2026-06-03 | 对齐 [product-principles.md](./product-principles.md) |
| 2026-06-04 | 按 M3 范式细化：v2.1.0 = M4-01～03 + Pre-flight；团队同步 / 多 Tab 延后 |
| 2026-06-04 | **立项完成**：SP-01～03 结论写入 m4-design.md；场景包样例 fixtures/m4-scene-pack-v1.example.json |
