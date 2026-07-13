#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$(cd "$PLUGIN_DIR/../desktop-app" && pwd)"

cd "$APP_DIR"
npm run tauri dev
