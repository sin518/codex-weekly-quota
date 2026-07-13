# Codex 周额度

一个面向 macOS 和 Windows 的 Codex 周额度伴随悬浮条原型。

## 当前状态

- 已实现 260 × 36 px 超窄玻璃胶囊组件。
- 已支持系统浅色与深色模式。
- 已创建 Tauri 2 + React + TypeScript 桌面工程。
- 已创建可验证的 Codex 插件外壳。
- 原生运行时通过官方 Codex App Server 的 `account/rateLimits/read` 读取真实额度。
- 浏览器开发预览使用 `MockQuotaProvider`，不会伪装成真实额度。
- macOS 已实现 ChatGPT/Codex 窗口自动吸附、移动跟随和最小化隐藏。
- Windows 已加入原生窗口枚举实现，需要在 Windows 机器上完成最终编译验证。

## 项目结构

- `design/`：效果图。
- `desktop-app/`：Tauri 桌面程序。
- `codex-weekly-quota/`：Codex 插件。

## 本地启动

目的：启动透明、置顶的额度条开发窗口。

1. 安装 Node.js 和 Rust。
2. 进入 `desktop-app`。
3. 运行 `npm install`。
4. 运行 `npm run tauri dev`。

成功标志：Codex 窗口页眉中央出现一条显示真实周额度的玻璃胶囊。

## 额度数据

桌面应用启动本机 `codex app-server --stdio`，完成官方初始化握手后调用：

```text
account/rateLimits/read
```

应用选择返回结果中时长最长的额度窗口作为周额度。接口能提供使用百分比、窗口时长、下一次重置时间，以及可用重置额度次数（如果服务返回）。接口不提供历史累计重置次数。

## 安全说明

当前版本不会直接读取 Codex Cookie、`auth.json`、会话令牌或聊天记录。身份验证由用户已经登录的官方 Codex App Server 处理。

## 应用内更新

设置按钮位于额度条最右侧。用户可选择：

- 启动时自动检查更新。
- 仅在设置中手动检查。

更新清单来自：

```text
https://github.com/sin518/codex-weekly-quota/releases/latest/download/latest.json
```

发布前需要在 GitHub 仓库配置：

- `TAURI_SIGNING_PRIVATE_KEY`：`tauri.key` 的完整内容。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：可选；仅在生成私钥时设置过密码才需要添加。

私钥文件已经被 `.gitignore` 排除，不得提交到仓库。推送 `v*` 标签（例如 `v0.1.3`）会触发 macOS 与 Windows 发布流程。
