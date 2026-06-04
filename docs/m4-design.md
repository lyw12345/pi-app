# M4 产品设计 & 技术方案

**版本**：2026-06-04  
**状态**：设计稿（立项完成，待评审）  
**关联**：[总计划](./plan-pi-web-macos-workbench.md) · [M4 清单](./m4-checklist.md) · [M3 设计](./m3-design.md) · [贯穿原则](./product-principles.md)

---

## 0. 文档目的

为 M4（pi-web / macOS App **v2.1.0**）提供可评审的**产品规格**与**实现蓝图**，使清单项 M4-01～03 有统一的交互、数据与接口约定。实现时以本文 + `m4-checklist.md` 为验收依据。

**范围边界**

| 在 v2.1.0 | 不在 v2.1.0（v2.2+ / backlog） |
|-----------|----------------------------------|
| 扩展目录只读浏览（高级） | 扩展在线编辑、npm 市场 |
| 场景包 JSON 导入 / 导出 | 团队 Git / HTTP 自动同步（M4-04） |
| 分享对话向导（HTML + 只读远程说明） | 单会话 deep link、公网托管 |
| `npm run test:m4` 冒烟 | 扩展 enable/disable 写 settings（M4-05） |

---

# 第一部分：Pre-flight 结论（SP-01～03）

立项三项 spike 已完成；结论如下，作为下文设计的输入。

## SP-01 — pi 扩展列表来源

**调研对象**：`@earendil-works/pi-coding-agent` 的 `DefaultPackageManager`、`ResourceLoader`、`discoverAndLoadExtensions`、`get_commands` RPC。

**发现**

| 能力 | pi 现状 | pi-web 现状 |
|------|---------|-------------|
| 扩展路径解析 | `PackageManager.resolve()` → `ResolvedPaths.extensions[]`，含 `path` / `enabled` / `metadata` | 无 |
| 自动发现 | `discoverAndLoadExtensions`：`<cwd>/.pi/extensions/`、`~/.pi/agent/extensions/`、settings 显式路径 | 无 |
| 加载与错误 | `loadExtensions` → `LoadExtensionsResult { extensions, errors }` | 无 |
| RPC 列表 | **无** `get_extensions`；仅有 `get_commands`（含 `source: "extension"` + `path`） | M3 已接 `get_commands` |

**决策**

1. **v2.1 不阻塞上游**：不在 pi 新增 `get_extensions` RPC；pi-web 服务端直接调用 pi 包 API。
2. **`GET /api/extensions`** 聚合逻辑（与 CLI 同 cwd / agentDir）：
   - 用 `SettingsManager` + `DefaultPackageManager.resolve()` 得到配置路径及 `enabled`。
   - 用 `discoverAndLoadExtensions(configuredEnabledPaths, cwd, agentDir)` 得到加载结果（含 `errors`）。
   - 合并「配置但未加载」与「自动发现」条目，去重键为 `resolvedPath`。
3. **展示字段**（见 §5 API）：`id`（resolvedPath hash 或 path）、`path`、`displayName`、`enabled`、`source`（user/project/auto/cli）、`commands[]`、`loadError?`。
4. **`commands`  enrichment**：若存在同 cwd 的活跃 RPC 会话，可选调用 `get_commands` 并按 `path` 归组；**无会话时** commands 为空数组（列表仍显示路径与 loadError）。
5. **缓存**：API 层内存缓存 30s（key = `cwd|agentDir`），避免设置页每次打开都 jiti 全量加载；`Cache-Control: no-store` 仍返回，缓存仅进程内。
6. **M4-05 预留**：若上游日后提供 `get_extensions`，可替换实现，对外 JSON schema 不变。

**不采用**：纯读 `settings.json` 不 load（会漏自动发现目录与 load-time 错误）。

---

## SP-02 — 只读分享选型

**选项**

| 选项 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **A** HTML 导出 + 白话步骤 | 已有 `export_html` / `GET .../export.html` | 零服务端、离线、符合 product-principles | 非实时 |
| **B** 只读 remote | `PI_WEB_REMOTE=1` + `PI_WEB_REMOTE_READ_ONLY=1` + 配对 | 实时围观、已有 middleware | 需开远程、非单文件 |
| **C** 局域网-only 围观 | 单独协议 | — | 与 B 重复；B 已支持 hostname allowlist |

**决策（v2.1 采用 A 为主 + B 为进阶步骤）**

1. **主路径**：聊天菜单「分享此对话」→ 向导 Step 1「下载 HTML」（复用 `download-export-html.ts`）→ Step 2「发送给他人」说明（邮件/网盘/内网文件共享）。
2. **进阶路径**：Step 3 折叠卡片「实时只读围观」→ 链到设置内已有远程向导；强调默认关、只读勾选、审计日志 `pi-web-remote-audit.jsonl`。
3. **v2.1 不做**：单会话 URL（`?session=` deep link 给远程访客）、公网托管、Gist。
4. **脱敏**（M4-03 验收）：
   - 导出前对 HTML 字符串做 `sanitizeExportHtml()`：`auth.json` 路径、Bearer/API key 模式、`~` 替换 home 绝对路径（保留相对路径）。
   - 若 pi `export_html` 已不含密钥，sanitize 仍作 defense-in-depth。
5. **只读验证**：远程 readOnly 模式下 `POST /api/agent/[id]` 变更类 command 须 403（沿用 `local-request-guard` / middleware）；`test:m4` 含 smoke。

---

## SP-03 — 场景包 JSON schema

**背景**：`scene-overrides.json` 与 CRUD API 已在 CHANGELOG / [scene-config 设计](./superpowers/specs/2026-06-02-pi-web-scene-config-page-design.md) 中定义；若 v2.1 开发时尚未合入主干，**M4-02 与场景 CRUD 同 PR 或先行合入**。

**决策**

1. **包格式**：独立文件 `*.pi-scene-pack.json`（也可粘贴 JSON），`schemaVersion: 1`。
2. **内容**：仅 `scenes` override map，**不含**静态场景定义（静态 catalog 仍随 pi-web 发版）。
3. **导入**：`POST /api/scene-overrides/import` → `{ preview: true }` 返回 diff；`{ apply: true }` 写盘；未知 `sceneId` → 400 白话列表。
4. **导出**：`GET /api/scene-overrides/export` → 整包或 `?sceneId=` 单场景。
5. **样例**：[`docs/fixtures/m4-scene-pack-v1.example.json`](./fixtures/m4-scene-pack-v1.example.json)。

字段边界与 CRUD 一致：`defaultPrompt` ≤16K、`outputStyle` ≤500、`suggestedStarters` ≤8×200，经 `sanitizePromptInput`。

---

# 第二部分：产品设计

## 1. 用户与场景

| 角色 | M4 目标 | 默认路径是否改变 |
|------|---------|------------------|
| **主用户** | 无新必填步骤 | 否 |
| **进阶用户** | 查看扩展加载情况；导出/导入场景包；分享 HTML | 仅显式开「高级」后进扩展页 |
| **协作者（只读）** | 通过 HTML 或（可选）只读 remote 查看 | 远程仍默认关 |

**成功标准（与清单里程碑一致）**

- 默认用户：首页与顶栏无扩展/导入/分享新入口（分享可从聊天菜单进，非高级专属）。
- 进阶：扩展列表与 CLI 同 agent 目录下数量一致；load 错误可见。
- 场景包：导出 → 另一实例导入 → launch 行为一致（在 scene CRUD 存在前提下）。
- 分享：HTML 不含 API key / auth 路径；只读 remote 无法 POST 变更。
- `npm run test:m4` 绿。

---

## 2. 信息架构（M4 增量）

```
pi-web
├── 对话 ?session=<id>
│   └── ChatInput 溢出菜单
│       ├── [M3] 导出 HTML
│       └── [M4-03] 分享此对话…（向导 Modal）
└── 设置 workbenchView=settings（advancedMode）
    ├── [M4-01] 已安装扩展（只读列表）
    ├── [M4-02] 场景包 导出 / 导入（或 SceneConfigEditor 内）
    └── [M3] 远程访问（M4-03 链入）
```

**门禁**

| 能力 | 默认用户 | 进阶 |
|------|----------|------|
| 扩展列表 | 不可见 | 设置 → 高级 |
| 场景包 import/export | 不可见 | 设置 → 高级（或与场景编辑同区） |
| 分享向导 | 聊天菜单可见 | 同左 |

---

## 3. 关键用户流程

### 3.1 扩展浏览（M4-01）

1. 打开高级模式 → 设置 →「已安装扩展」。
2. 列表展示：名称、路径、来源、启用、已注册命令、加载错误（红色一行）。
3. 底部链到 pi [extensions.md](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)；文案说明「修改扩展后请重启 pi-web / App」。

### 3.2 场景包（M4-02）

1. 设置 →「场景包」→ 导出 → 下载 `scenes-<date>.pi-scene-pack.json`。
2. 导入 → 选择文件 → 预览 diff（按 sceneId 列出将新增/覆盖/跳过的字段）→ 确认 → 成功 toast；`workbench:scenes` cache invalidate。

### 3.3 分享向导（M4-03）

1. 聊天输入区「…」→「分享此对话」。
2. Step 1：下载 HTML（streaming 时 disabled，与 M3 一致）。
3. Step 2：如何发送（静态说明，i18n）。
4. Step 3（折叠）：「需要对方实时看进度？」→ 打开设置远程区 / 复制只读说明。

---

# 第三部分：技术方案

## 4. 架构

```text
Browser
  ├─ GET  /api/extensions?cwd=          → lib/extensions-reader.ts
  │                                        ├─ DefaultPackageManager.resolve()
  │                                        └─ discoverAndLoadExtensions()
  ├─ GET  /api/scene-overrides/export   → lib/scene-overrides.ts
  ├─ POST /api/scene-overrides/import   → preview | apply
  └─ GET  /api/agent/[id]/export.html   → (M3) + sanitizeExportHtml on wire

lib/middleware-auth.ts                  → readOnly 403 for mutations (existing)
```

**cwd 参数**：`/api/extensions` 默认 `defaultWorkspaceCwd`（来自 preferences）或 `process.cwd()`；与新建会话 cwd 一致。

---

## 5. API 规格

### 5.1 `GET /api/extensions`

**Query**：`cwd?`（绝对路径）

**Response 200**

```ts
interface ExtensionsResponse {
  cwd: string;
  agentDir: string;
  extensions: ExtensionListItem[];
  errors: Array<{ path: string; error: string }>;
}

interface ExtensionListItem {
  path: string;
  resolvedPath: string;
  displayName: string;
  enabled: boolean;
  source: "user" | "project" | "auto" | "cli" | "unknown";
  scope?: string;
  commands: Array<{ name: string; description?: string }>;
  loadError?: string;
}
```

**Auth**：`requireApiAuth`（与现 API 一致）。

---

### 5.2 场景包

**Export** — `GET /api/scene-overrides/export`

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-06-04T12:00:00.000Z",
  "piWebVersion": "2.1.0",
  "scenes": {
    "report-generation": {
      "outputStyle": "...",
      "suggestedStarters": ["..."]
    }
  }
}
```

**Import** — `POST /api/scene-overrides/import`

Body: `{ pack: ScenePackV1, preview?: boolean, apply?: boolean }`

Preview 200:

```json
{
  "preview": true,
  "unknownSceneIds": [],
  "changes": [
    { "sceneId": "report-generation", "action": "update", "fields": ["outputStyle"] }
  ]
}
```

Apply 200: `{ applied: number, skipped: number }`

---

### 5.3 分享

无新 REST 端点；组件层：

- `ShareConversationModal.tsx` — 调 `downloadExportHtml(sessionId)` + 静态 copy。
- `lib/sanitize-export-html.ts` — 纯函数，单元测试。

---

## 6. 组件改动清单

| 文件 | M4 项 | 改动要点 |
|------|-------|----------|
| `lib/extensions-reader.ts` | 01 | 新建；聚合 pi 包 |
| `app/api/extensions/route.ts` | 01 | GET |
| `components/ExtensionsSettings.tsx` | 01 | 高级卡片 + 列表 |
| `components/WorkbenchSettings.tsx` | 01, 02 | 入口 |
| `lib/scene-overrides.ts` | 02 | 若未存在则按 scene-config 设计实现 |
| `app/api/scene-overrides/export/route.ts` | 02 | GET |
| `app/api/scene-overrides/import/route.ts` | 02 | POST |
| `components/ScenePackControls.tsx` | 02 | 导入导出 UI |
| `components/ShareConversationModal.tsx` | 03 | 向导 |
| `components/ChatInput.tsx` | 03 | 菜单项 |
| `lib/sanitize-export-html.ts` | 03 | 脱敏 |
| `lib/i18n/messages/*.ts` | 全部 | 新 key |
| `scripts/m4-preflight.mjs` | — | 冒烟 |
| `package.json` | — | `"test:m4"` |

---

## 7. 测试与 Pre-flight

### 7.1 `npm run test:m4`（建议覆盖）

1. `GET /api/health` — ok  
2. `GET /api/extensions` — `extensions` 为数组（允许空）  
3. `GET /api/scene-overrides/export` — `schemaVersion === 1`  
4. `POST /api/scene-overrides/import` preview — 合法 pack 返回 `changes`  
5. `GET /api/agent/[id]/export.html` — body 经 sanitize 不含 `sk-` / `auth.json` 样例模式（fixture 或 regex）  
6. （可选）remote readOnly：`POST` agent prompt 在 `PI_WEB_REMOTE_READ_ONLY=1` 下 403 — 若 CI 可设 env  

单元测试：

- `sanitizeExportHtml` 边界  
- `mergeScenePackPreview` diff 逻辑  
- `extensions-reader` 去重与 enabled 合并（mock fs / mock pi）

---

## 8. 实施顺序

```text
立项评审（本文）→ M4-02（+ scene CRUD 若缺）→ M4-01 → M4-03 → test:m4 → v2.1.0
```

M4-02 与 M4-01 可并行不同人；M4-03 仅依赖 M3 export。

---

## 9. 风险与对策

| 风险 | 对策 |
|------|------|
| `discoverAndLoadExtensions` 慢 | 30s 进程内缓存；设置页 loading skeleton |
| scene-overrides 未合入 | M4-02 首 PR 带 CRUD 或 rebase 依赖 |
| HTML 脱敏漏网 | 正则 + 测试；不声称 cryptographic redaction |
| 扩展 jiti 与 Next 打包 | 仅 `app/api` 服务端 import pi-coding-agent |
| 远程分享误导为默认开 | 向导 Step 3 折叠 + 与 product-principles §3 文案一致 |

---

## 变更记录

| 日期 | 说明 |
|------|------|
| 2026-06-04 | 立项：SP-01～03 结论 + M4-01～03 设计稿 |
