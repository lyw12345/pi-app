# 回归：App 与 CLI 共用会话文件

M2-06 验收项：同一工作区下，Pi macOS App / pi-web 与 Pi CLI 读写同一批 `~/.pi/agent/sessions/` 下的 `.jsonl` 文件。

## 步骤

1. 在 **pi-web**（或 App）对工作区 `~/your-project` 新建会话，发送一条用户消息，记下侧栏会话标题或 id。
2. 在同一机器打开 **Pi CLI**，`cd ~/your-project`，`pi` 列出/打开会话，确认能看到同一条首条用户消息。
3. 在 CLI 中继续对话一轮，保存退出。
4. 回到 pi-web 刷新侧栏，打开同一会话，确认 CLI 的回复出现在时间线中。
5. （可选）在 pi-web 侧栏重命名会话，CLI 侧再次打开，确认 `session_info` 名称一致（顶栏/侧栏显示）。

## 通过标准

- 无第二套会话目录；fork 产生的新 `.jsonl` 在两侧列表均可见（子会话 `parentSession` 元数据仅影响树展示）。
- 分支切换（`navigate_tree`）后两侧打开同一会话 id 看到相同叶子路径。

## 失败时排查

- `PI_CODING_AGENT_DIR` 是否一致（App 与 CLI 勿指向不同 agent 目录）。
- 工作区 cwd 编码路径是否一致（会话按 cwd 分目录存储）。
