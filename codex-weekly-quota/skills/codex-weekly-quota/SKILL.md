---
name: codex-weekly-quota
description: Start, stop, inspect, or diagnose the local Codex weekly quota desktop overlay. Use when the user asks about the quota capsule, its mock data, synchronization state, or local desktop companion app.
---

# Codex Weekly Quota

This plugin controls a local companion overlay. It does not inject UI into the native Codex header and must never read browser cookies, ChatGPT session tokens, or account credentials.

## Workflow

1. Explain that the native build reads rate limits through the official local Codex App Server, while browser-only preview uses `MockQuotaProvider`.
2. Before running a command, tell the user whether it starts a local process or installs dependencies.
3. From the plugin root, use `scripts/start-overlay.sh` on macOS or `scripts/start-overlay.ps1` on Windows.
4. If startup fails, check Node.js, npm dependencies, Rust, and Tauri prerequisites in that order.
5. Treat the green dot as a successful App Server synchronization signal.

## Safety boundary

- Never scrape credentials or copy session cookies.
- Never claim the browser-preview mock percentage is the user's real quota.
- Do not describe available reset credits as historical completed resets.
- Do not install system dependencies without explaining the impact first.
- Real quota support must be added through a documented or explicitly user-authorized provider.
