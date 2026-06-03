# Pi macOS App — 用户说明（M1）

## 安装

1. 将 `Pi.app` 拖入「应用程序」文件夹。
2. 双击打开。首次启动可能需要最多 30 秒等待本地服务就绪。
3. 按首次运行向导完成：工作区 → AI 服务 → 通知 → 首条对话。

无需单独安装 Node.js；App 内嵌运行时与 pi-web 构建产物。

## 工作区

- 向导中选择的文件夹即 pi 的 **cwd（工作区）**。
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

- **场景首页**：默认入口，从场景卡片开始对话。
- **自动整理 / 自动重试**：默认开启，可在设置中关闭。
- **导出对话**：聊天页或设置中下载 HTML，可在 Finder 中打开。
- **任务通知**：对话结束时收到系统通知，点击回到对应对话。

## 高级模式

首页底部或设置中进入「高级模式」，可展开会话侧栏与完整工具预设。

## 开发模式

本地开发仍可使用：

```bash
npm run dev   # http://127.0.0.1:30141
```

无 macOS 壳时，Web Push 作为 `agent_end` 通知回退；壳环境优先系统通知。
