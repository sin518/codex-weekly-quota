# Codex 周额度

一个面向 macOS 和 Windows 的 Codex 周额度伴随悬浮条，通过玻璃胶囊实时显示额度使用情况，支持窗口吸附和自动更新。

## 功能特性

- **超窄玻璃胶囊**：260 × 36 px 极简设计，支持系统浅色与深色模式自适应
- **智能窗口吸附**：自动吸附到 Codex 窗口上方，跟随移动，最小化时自动隐藏
- **实时额度监控**：通过官方 Codex App Server 读取真实额度数据，无需额外登录
- **应用内更新**：支持自动检查更新，使用签名验证确保安全性
- **跨平台支持**：原生支持 macOS（Intel & Apple Silicon）和 Windows

## 当前版本

**v0.1.8** - 已实现完整的桌面应用和 Codex 插件功能。

### 技术栈

- 前端：React 19 + TypeScript + Vite
- 桌面框架：Tauri 2
- 后端逻辑：Rust
- 样式：原生 CSS（毛玻璃效果）

## 项目结构

```
.
├── design/                        # 设计稿与效果图
│   ├── codex-weekly-quota-concept-v1.png
│   └── codex-weekly-quota-concept-v2-compact.png
├── desktop-app/                   # Tauri 桌面应用
│   ├── src/                       # React 前端代码
│   │   ├── App.tsx                # 主应用组件
│   │   ├── components/            # React 组件
│   │   ├── providers/             # 数据提供者
│   │   └── updates/               # 更新检查逻辑
│   ├── src-tauri/                 # Rust 后端代码
│   │   └── src/
│   │       ├── lib.rs             # 主入口与命令定义
│   │       ├── quota.rs           # 额度数据读取
│   │       └── window_tracker.rs  # 窗口吸附与跟随
│   └── scripts/                   # 构建与发布脚本
├── codex-weekly-quota/            # Codex 插件
│   ├── .codex-plugin/
│   │   └── plugin.json            # 插件元数据
│   └── skills/                    # 插件技能定义
├── releases/                      # 本地构建产物存储
└── .github/workflows/             # CI/CD 自动化
    └── release.yml                # 发布流程
```

## 快速开始

### 环境要求

- **Node.js** 18+ 
- **Rust** 1.70+
- **操作系统**：macOS 10.15+ 或 Windows 10+

### 本地开发

1. **克隆仓库**
   ```bash
   git clone https://github.com/sin518/codex-weekly-quota.git
   cd codex-weekly-quota/desktop-app
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **启动开发服务器**
   ```bash
   npm run tauri dev
   ```

4. **验证运行**
   - 启动后会自动打开透明置顶的额度条窗口
   - 如果 Codex 应用正在运行，额度条会自动吸附到窗口上方
   - 显示真实周额度数据（需要本地已登录 Codex）

### 构建安装包

```bash
npm run tauri build
```

构建产物位于 `desktop-app/src-tauri/target/release/bundle/`。

## 工作原理

### 额度数据获取

桌面应用通过启动本地 `codex app-server --stdio` 进程与官方 Codex App Server 通信：

1. 完成 JSON-RPC 初始化握手
2. 调用 `account/rateLimits/read` 接口
3. 从返回的多个额度窗口中选择时长最长的作为周额度
4. 解析并显示：
   - 使用百分比
   - 窗口时长（如 7 天）
   - 下一次重置时间
   - 可用重置额度次数（如果服务端返回）

**数据来源示例响应**：
```json
{
  "rateLimits": [
    {
      "windowSeconds": 604800,
      "used": 42,
      "limit": 100,
      "nextResetAt": "2026-07-20T00:00:00Z"
    }
  ]
}
```

应用选择 `windowSeconds` 最大的窗口作为周额度显示。

### 窗口吸附逻辑

#### macOS 实现
- 使用 Accessibility API 监听 Codex 窗口位置变化
- 定期轮询目标窗口的位置和尺寸
- 自动计算并更新额度条位置（窗口上方居中）
- 检测窗口最小化状态并隐藏额度条

#### Windows 实现
- 使用 Win32 API 枚举窗口句柄
- 通过窗口标题匹配 Codex/ChatGPT 窗口
- 监听窗口移动和最小化事件
- 同步更新额度条位置

### 安全设计

本应用**不会**：
- 读取 Codex Cookie
- 访问 `auth.json` 或会话令牌
- 读取聊天记录或对话历史
- 发送数据到第三方服务器

所有身份验证由用户本地已登录的官方 Codex App Server 处理，应用仅通过标准 JSON-RPC 接口读取额度数据。

## 应用内更新

### 更新机制

- 应用启动时检查 GitHub Releases 的更新清单
- 清单地址：`https://github.com/sin518/codex-weekly-quota/releases/latest/download/latest.json`
- 使用 Tauri 内置更新器验证签名
- 支持静默下载和用户确认安装

### 用户设置

点击额度条右侧的设置按钮（⚙️），可配置：
- ✅ **启动时自动检查更新**（默认开启）
- ⚙️ **仅在设置中手动检查**

### 更新清单格式示例

```json
{
  "version": "0.1.8",
  "notes": "修复窗口吸附逻辑，优化性能",
  "pub_date": "2026-07-13T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "...",
      "url": "https://github.com/.../Codex_Weekly_Quota_0.1.8_aarch64.app.tar.gz"
    },
    "darwin-x86_64": { ... },
    "windows-x86_64": { ... }
  }
}
```

## 发布流程

### 自动发布（推荐）

1. **更新版本号**
   - 编辑 `desktop-app/package.json` 中的 `version`
   - 编辑 `desktop-app/src-tauri/Cargo.toml` 中的 `version`
   - 确保两者版本号一致

2. **提交并打标签**
   ```bash
   git add .
   git commit -m "chore: bump version to 0.1.9"
   git tag v0.1.9
   git push origin main --tags
   ```

3. **GitHub Actions 自动构建**
   - 推送 `v*` 标签会触发 `.github/workflows/release.yml`
   - 自动构建 macOS（Intel + Apple Silicon）和 Windows 安装包
   - 生成签名的更新清单 `latest.json`
   - 创建 GitHub Release 并上传所有产物

### GitHub Secrets 配置

在仓库设置中添加以下 Secrets：

| Secret 名称 | 说明 | 是否必需 |
|------------|------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | `tauri.key` 文件的完整内容 | ✅ 必需 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码（如果生成时设置了） | ⚠️ 可选 |

**生成签名密钥**（首次发布）：
```bash
cd desktop-app
npm run tauri signer generate -- -w tauri.key
```

⚠️ **安全提示**：
- `tauri.key` 和 `tauri.key.pub` 已被 `.gitignore` 排除
- 切勿将私钥提交到仓库
- 妥善保管私钥备份

### 手动构建（本地测试）

```bash
cd desktop-app
npm run tauri build
```

构建产物会保存到：
- macOS: `src-tauri/target/release/bundle/dmg/`
- Windows: `src-tauri/target/release/bundle/msi/`

## Codex 插件

插件位于 `codex-weekly-quota/` 目录，可通过 Codex 应用加载。

### 插件功能

- 启动/停止桌面额度条
- 诊断额度条运行状态
- 通过自然语言控制额度条行为

### 使用方法

1. 在 Codex 中加载插件：
   ```
   /plugin load ~/path/to/codex-weekly-quota
   ```

2. 使用插件技能：
   ```
   Check the Codex weekly quota overlay and help me start it.
   ```

### 插件元数据

参见 `codex-weekly-quota/.codex-plugin/plugin.json`：
- 显示名称：Codex Weekly Quota
- 分类：Productivity
- 能力：本地桌面悬浮、额度状态诊断

## 技术细节

### 依赖关系

**前端（React）**
```json
{
  "@tauri-apps/api": "^2",
  "@tauri-apps/plugin-opener": "^2",
  "@tauri-apps/plugin-process": "^2.3.1",
  "@tauri-apps/plugin-updater": "^2.10.1",
  "react": "^19.1.0",
  "react-dom": "^19.1.0"
}
```

**后端（Rust）**
```toml
[dependencies]
tauri = { version = "2", features = ["macos-private-api"] }
tauri-plugin-opener = "2"
tauri-plugin-process = "2"
tauri-plugin-updater = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[target.'cfg(target_os = "windows")'.dependencies]
windows-sys = { version = "0.61", features = [
  "Win32_Foundation",
  "Win32_UI_WindowsAndMessaging",
] }
```

### 关键文件说明

| 文件路径 | 功能 |
|---------|------|
| `desktop-app/src/App.tsx` | React 主组件，处理 UI 渲染和状态管理 |
| `desktop-app/src/App.css` | 毛玻璃效果和深色模式样式 |
| `desktop-app/src-tauri/src/lib.rs` | Tauri 命令注册和主逻辑入口 |
| `desktop-app/src-tauri/src/quota.rs` | JSON-RPC 通信和额度数据解析 |
| `desktop-app/src-tauri/src/window_tracker.rs` | 跨平台窗口检测和吸附逻辑 |
| `desktop-app/scripts/collect-installers.mjs` | 本地构建产物收集脚本 |
| `.github/workflows/release.yml` | CI/CD 发布流程定义 |

## 故障排查

### 额度条无法显示

1. **检查 Codex 是否已登录**
   ```bash
   codex app-server --stdio
   # 应返回初始化握手响应
   ```

2. **查看应用日志**
   - macOS: `~/Library/Logs/codex-weekly-quota/`
   - Windows: `%APPDATA%\codex-weekly-quota\logs\`

3. **验证窗口吸附**
   - 确保 Codex/ChatGPT 应用正在运行
   - 尝试移动 Codex 窗口，观察额度条是否跟随

### 更新检查失败

1. **检查网络连接**
   ```bash
   curl -I https://github.com/sin518/codex-weekly-quota/releases/latest/download/latest.json
   ```

2. **验证签名密钥**
   - 确保 GitHub Secrets 中的 `TAURI_SIGNING_PRIVATE_KEY` 正确
   - 检查公钥 `tauri.key.pub` 是否与打包时使用的私钥匹配

### Windows 窗口检测问题

如果 Windows 版本无法检测到 Codex 窗口：
- 检查窗口标题是否包含 "Codex" 或 "ChatGPT"
- 查看 `window_tracker.rs` 中的窗口标题匹配逻辑
- 尝试以管理员权限运行

## 开发路线图

- [ ] 支持多窗口吸附（同时打开多个 Codex 窗口）
- [ ] 添加历史额度趋势图
- [ ] 支持自定义额度条样式和位置
- [ ] Linux 平台支持
- [ ] 额度预警和通知功能
- [ ] 导出额度使用数据为 CSV

## 贡献指南

欢迎提交 Issue 和 Pull Request！

### 提交前检查

- [ ] 代码通过 `npm run build` 编译
- [ ] 本地测试功能正常
- [ ] 遵循现有代码风格
- [ ] 更新相关文档

### 提交 PR

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m "feat: add your feature"`
4. 推送分支：`git push origin feature/your-feature`
5. 创建 Pull Request

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 致谢

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [React](https://react.dev/) - UI 组件库
- [Codex](https://codex.ai/) - 提供官方 App Server API

## 联系方式

- GitHub Issues: [https://github.com/sin518/codex-weekly-quota/issues](https://github.com/sin518/codex-weekly-quota/issues)
- 作者：sin518

---

**注意**：本项目为第三方工具，与 Codex 官方无关。使用本应用即表示同意自行承担风险。
