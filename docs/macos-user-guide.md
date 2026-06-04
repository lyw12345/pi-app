# Pi macOS App — 用户说明（M1 / M2）

## 安装

1. 将 `Pi.app` 拖入「应用程序」文件夹。
2. 双击打开。首次启动可能需要最多 30 秒等待本地服务就绪。
3. 在工作台首页选「新对话」或最近工作；工作区与 AI 服务在「设置」中配置。

无需单独安装 Node.js；App 内嵌运行时与 pi-web 构建产物。

## 工作区

- 设置中选择的文件夹即 pi 的 **cwd（工作区）**（macOS 壳可调 `pickWorkspaceDirectory`）。
- 路径保存在 `~/.pi/agent/pi-web-preferences.json` 的 `defaultWorkspaceCwd`。
- 新建对话默认使用该工作区。

## AI 服务 / 账户

- 在「AI 服务」页通过 OAuth 连接 provider。
- 凭据保存在 `~/.pi/agent/auth.json`，与 Pi CLI 共用。
- 至少连接一个服务后才能发消息。

## 数据目录

| 路径 | 内容 |
|------|------|
| `~/.pi/agent/sessions/` | 对话记录（`.jsonl`） |
| `~/.pi/agent/auth.json` | OAuth / API key |
| `~/.pi/agent/settings.json` | 默认模型、压缩/重试等 |
| `~/.pi/agent/pi-web-preferences.json` | pi-web 产品偏好（向导、工具模式等） |

菜单「打开数据文件夹」可在 Finder 中定位 `~/.pi/agent`。

## 常用功能

- **工作台首页**：默认入口，新对话与最近工作列表。
- **分支与整理**：顶栏「分支」可切换同一会话内路径；可勾选「切换前先总结」。时间线会显示「已整理」摘要块。详见 [管理对话与分支](./managing-conversations-and-branches.md)。
- **另开一版 / 复制为新对话**：用户消息上「从这里另开一版」= Fork；输入区「复制为新对话」= Clone。
- **自动整理 / 自动重试**：长对话自动摘要、失败自动重试，默认始终开启。
- **导出对话**：聊天输入区底部「导出 HTML」，可在 Finder 中打开。
- **斜杠命令**：输入 `/` 可补全并执行扩展、模板与技能命令。
- **会话侧栏与工具**：左侧会话树、完整工具预设、顶栏 System 面板默认可用。
- **任务通知**：对话结束时收到系统通知，点击回到对应对话。
- **关于 Pi**：应用菜单可查看 pi-web 与 pi-coding-agent 版本。

## 开发模式

本地开发仍可使用：

```bash
npm run dev   # http://127.0.0.1:30141
```

无 macOS 壳时，Web Push 作为 `agent_end` 通知回退；壳环境优先系统通知。
