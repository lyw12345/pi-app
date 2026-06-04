# pi-web

[pi 编程智能体](https://github.com/badlogic/pi-mono) 的网页界面。在浏览器中浏览会话、与智能体对话、分叉对话、切换消息分支。

## 快速开始

**无需安装，直接运行：**

```bash
npx @agegr/pi-web@latest
```

**或全局安装后使用：**

```bash
npm install -g @agegr/pi-web
pi-web
```

启动后打开 [http://localhost:30141](http://localhost:30141)。

**可选参数：**

```bash
pi-web --port 8080               # 自定义端口
pi-web --hostname 127.0.0.1      # 仅本机访问
pi-web --remote                  # 开启远程访问并绑定 0.0.0.0
pi-web -p 8080 -H 127.0.0.1     # 组合使用

PORT=8080 pi-web                 # 也支持环境变量
```

> 安全提示：pi-web 会提供本地会话删除、模型配置和 API key 写入等接口。默认仅绑定 localhost。远程访问需显式开启（`--remote` 或 Settings → Remote access），并通过配对链接或 Bearer token 认证。详见 [docs/remote-access.md](docs/remote-access.md)。

## 功能介绍

- **会话浏览器** — 按工作目录分组展示所有 pi 会话
- **实时对话** — 通过 SSE 流式输出与智能体实时交互
- **会话分叉** — 从用户消息「从这里另开一版」创建独立 `.jsonl` 子会话
- **复制为新对话** — 将当前分支整段复制为新的独立会话（Clone）
- **会话内分支** — 回退到任意节点继续对话，在同一文件内创建分支
- **分支导航器** — 可视化切换分支；可选「切换前先总结」
- **整理摘要** — 自动/手动整理后在时间线显示可折叠的白话摘要块
- **会话标题** — 侧栏重命名，顶栏与列表同步显示
- **模型切换** — 对话中途随时切换模型
- **工具面板** — 控制智能体可使用的工具
- **压缩会话** — 对长会话进行摘要，节省上下文窗口
- **引导 / 追加** — 打断正在运行的智能体，或在其完成后追加消息

## 注意事项

- **数据目录** — 默认读取 `~/.pi/agent/sessions` 下的会话文件。可通过环境变量 `PI_CODING_AGENT_DIR` 指定其他目录（本地开发时见下方「端口与数据隔离」，勿写入 `.env.local`）。
- **模型配置** — 从智能体数据目录下的 `models.json` 读取可用模型，可在侧边栏的「Models」面板中编辑。
- **文件浏览** — 侧边栏内置文件浏览器，可在标签页中查看当前工作目录下的文件。

## 规划

总计划：[docs/plan-pi-web-macos-workbench.md](docs/plan-pi-web-macos-workbench.md)  
贯穿原则（M1–M4）：[docs/product-principles.md](docs/product-principles.md)

| 里程碑 | 版本 | 清单 |
|--------|------|------|
| M1 装好就会用 | v1.0 | [清单](docs/m1-checklist.md) · [设计/技术方案](docs/m1-design.md) |
| M2 日常办公够用 | v1.1–v1.2 | [docs/m2-checklist.md](docs/m2-checklist.md) |
| M3 强于普通 Chat | v2.0 | [docs/m3-checklist.md](docs/m3-checklist.md) |
| M4 平台化（按需） | v2.x+ | [docs/m4-checklist.md](docs/m4-checklist.md) |

## 开发

```bash
npm install
npm run lint
npm run test:run
```

### 端口与数据隔离

**原则：30141 是你日常使用的服务；开发、改代码、跑测试只动 30142，不要影响 30141。**

| 用途 | 端口 | 命令 | 数据目录 | 说明 |
|------|------|------|----------|------|
| **日常使用** | **30141** | `npm start` 或全局 `pi-web` | `~/.pi/agent/` | 稳定服务，不随源码热更新 |
| **开发 / 测试** | **30142** | `npm run dev` | `~/tmp/pi-dev-agent/` | 改代码、试功能只用此端口 |

```bash
# 30141 — 日常服务（先 build 一次，之后可长期开着）
npm run build && npm start

# 30142 — 开发测试（与 30141 可同时运行）
npm run dev
```

### 让改动在 30141 上生效

30141 使用 `next start`，读取仓库根目录的 `.next` 生产构建，**不会**像 30142 那样随保存自动热更新。在 30142 上验证通过的 UI/逻辑修复，要同步到日常端口必须：

```bash
npm run build
# 若 30141 已在运行，先结束占用该端口的进程，再：
npm start
```

浏览器打开 [http://127.0.0.1:30141](http://127.0.0.1:30141) 后建议 **硬刷新**（Cmd+Shift+R），避免旧前端资源缓存。

- **本仓库**：`npm start` 或 macOS [PiWorkbench](macos/README.md)（内嵌子进程连 `127.0.0.1:30141`）——在本目录 `build` 并重启即可。
- **全局 `pi-web`**：需在该包的安装目录执行 `npm run build` 后再启动 CLI，否则仍是旧构建。

`npm run dev` 会设置 `PI_CODING_AGENT_DIR=~/tmp/pi-dev-agent`，并使用独立构建目录 `.next-dev-30142`，避免与 30141 抢锁、混数据。

**不要在 30141 上跑 `next dev`**（包括 `npm run dev:prod`）：它与 30142 共用同一份源码，保存文件时两边都会热更新，开发中的半成品会直接打断你在 30141 上的使用。30141 请用 `npm start`（或已安装的 `pi-web`）。

**不要在 `.env.local` 里设置 `PI_CODING_AGENT_DIR`**：Next.js 会在所有模式下加载该文件，导致 30141 误读空的 dev 目录、会话「丢失」。数据目录隔离只写在 `npm run dev` 脚本里。

偶尔需要在真实数据上调试 HMR 时，可临时使用 `npm run dev:prod`（30141 + `~/.pi/agent/`），**不要与 `npm run dev` 同时开**。

更多细节见 [AGENTS.md](AGENTS.md#dev--production-isolation)。

### macOS App（M1 本机测试）

```bash
npm run package:macos   # 产出 dist/macos/Pi.app（干净 .next + 生产依赖 + 内嵌 Node）
rm -rf /Applications/Pi.app
ditto dist/macos/Pi.app /Applications/Pi.app
open /Applications/Pi.app
```

大体积请用 `ditto` 安装，勿用 `cp -R`（易超时/异常）。若无法打开：`xattr -cr /Applications/Pi.app`。

详见 [macos/README.md](macos/README.md)。

## 项目结构

```
app/
  api/
    sessions/      # 读写会话文件
    agent/         # 发送命令、SSE 事件流
    files/         # 文件内容读取
    models/        # 可用模型列表与默认模型
    models-config/ # 读写 models.json
components/        # UI 组件
lib/
  session-reader.ts  # 解析 .jsonl 会话文件
  rpc-manager.ts     # 管理 AgentSession 生命周期
  normalize.ts       # 规范化 toolCall 字段名
  types.ts
```

会话文件存储路径：`~/.pi/agent/sessions/<编码后的工作目录>/<时间戳>_<uuid>.jsonl`
