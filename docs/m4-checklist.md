# M4 验收清单 — 平台化（v2.x+，按需）

**目标**：从个人 macOS 工作台扩展到团队协作、扩展生态与可分享协作形态。  
**周期**：TBD（M3 完成后按业务优先级启动）  
**总计划**：[plan-pi-web-macos-workbench.md](./plan-pi-web-macos-workbench.md)  
**前置**：[m3-checklist.md](./m3-checklist.md) 里程碑验收已全部通过  
**其它里程碑**：[M1](./m1-checklist.md) · [M2](./m2-checklist.md) · [M3](./m3-checklist.md)

**贯穿原则**：[product-principles.md](./product-principles.md)（凭据/工作区/壳/实现简单，全阶段适用）

> M4 含后端/共享存储项，需单独技术方案评审后再锁定排期。

---

## 里程碑验收（方向性，立项后细化）

- [ ] 扩展目录可浏览，用户能理解已安装扩展及启用状态
- [ ] 至少一种「只读分享」方式（导出链接 / 只读远程 / 静态 HTML 托管之一）
- [ ] 团队场景配置有明确同步方案（文件共享 / Git / 服务端之一）且文档完整
- [ ] 平台能力不破坏 M1 非技术用户默认路径（简洁工具、远程默认关、`auth.json` 与 CLI 共用）

---

## M4-A — 扩展管理

| ID | 任务 | 完成 |
|----|------|------|
| — | 扫描 `~/.pi/agent/extensions` 与项目 `.pi/extensions` | [ ] |
| — | UI：列表、描述、启用/禁用（若 pi 支持或文档说明限制） | [ ] |
| — | 链接到 pi 扩展开发文档，**不提供**在线编写 TS | [ ] |
| — | `/reload` 等价操作：提示用户重启服务或 App | [ ] |
| — | 扩展命令与 M3 命令面板白名单策略统一 | [ ] |

**模块**：新 `ExtensionsSettings`、可能需 pi 上游 API 支持

**依赖**：pi `extensions.md`、是否暴露 list extensions RPC

---

## M4-B — 协作与只读分享

| ID | 任务 | 完成 |
|----|------|------|
| — | 方案选型：只读远程会话 / 导出托管页 / 局域网围观 | [ ] |
| — | 只读模式与 `PI_WEB_REMOTE_READ_ONLY` 产品化 | [ ] |
| — | 分享链接生命周期（过期、撤销） | [ ] |
| — | 敏感信息脱敏策略（路径、API key 不出现在分享视图） | [ ] |
| — | 审计：谁何时打开只读链接 | [ ] |

**模块**：`lib/remote-auth.ts`、`RemoteAccessBanner`、可能新 `ShareSession` API

---

## M4-C — 团队场景同步

| ID | 任务 | 完成 |
|----|------|------|
| — | 需求定义：场景包包含哪些字段（starters、outputStyle、override） | [ ] |
| — | 同步载体：共享目录 / Git 仓库 / 中心服务（选一） | [ ] |
| — | 导入/导出场景包（JSON）最低可行版本 | [ ] |
| — | 冲突解决：本地 override vs 团队默认 | [ ] |
| — | 权限：谁可发布团队模板（若有多角色） | [ ] |

**模块**：`lib/scenes.ts`、`lib/scene-overrides.ts`、新 `team-templates` 模块

**依赖**：单独立项 PRD

---

## M4-D — 平台运维与合规（可选）

企业场景仍使用 pi 标准 agent 目录布局；**不**引入第二套 OAuth/凭据存储。

| ID | 任务 | 完成 |
|----|------|------|
| — | 集中日志：App + pi-web 错误上报（用户可选 opt-in） | [ ] |
| — | 企业部署：自定义 `PI_CODING_AGENT_DIR`、禁用远程 | [ ] |
| — | 会话保留策略：自动归档 / 删除向导 | [ ] |
| — | 多用户 macOS 同机配置隔离说明 | [ ] |

---

## M4-E — pi 上游能力跟进（ backlog ）

| 能力 | 说明 | 完成 |
|------|------|------|
| `bash` 面板 | 仅企业高级模式，需安全评审 | [ ] |
| Gist `/share` | 或自建等价物 | [ ] |
| JSON / print 模式 | 面向集成，非 App 主 UI | [ ] |
| 扩展自定义 UI | 需 Web 扩展协议，长期项 | [ ] |

---

## 交付物

- [ ] M4 技术方案文档（扩展 / 分享 / 团队同步各 1 页）
- [ ] v2.x 发布说明（按实际立项子集编写）

---

## 建议 Issue（M4 范围，立项后创建）

1. `spike: team scene sync options`
2. `spike: read-only session sharing`
3. `feat: extensions directory browser`
4. `feat: scene pack import/export`
5. `feat: enterprise deployment guide`

---

## 进度记录

| 日期 | 说明 |
|------|------|
| 2026-06-03 | 清单创建，M4 为方向性 backlog，排期待定 |
| 2026-06-03 | 对齐 [product-principles.md](./product-principles.md) |
