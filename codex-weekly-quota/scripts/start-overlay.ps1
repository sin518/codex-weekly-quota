$ErrorActionPreference = "Stop"

$PluginDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$AppDir = Resolve-Path (Join-Path $PluginDir "..\desktop-app")

Set-Location $AppDir
npm run tauri dev
