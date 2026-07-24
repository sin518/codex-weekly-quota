import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import "./App.css";
import { QuotaCapsule } from "./components/QuotaCapsule";
import { SettingsScreen } from "./components/SettingsScreen";
import { useWeeklyQuota } from "./hooks/useWeeklyQuota";
import { getUpdateStrategy } from "./updates/preferences";

function App() {
  const previewLabel = new URLSearchParams(window.location.search).get("window");
  const windowLabel = window.__TAURI_INTERNALS__
    ? getCurrentWebviewWindow().label
    : previewLabel === "settings" ? "settings" : "quota-overlay";
  return windowLabel === "settings" ? <SettingsScreen /> : <QuotaOverlay />;
}

function QuotaOverlay() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const dragging = useRef(false);
  const suppressButtonsUntil = useRef(0);
  const { quota, error, refreshing, manualRefresh } = useWeeklyQuota();

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__ || getUpdateStrategy() !== "automatic") return;
    const timer = window.setTimeout(() => {
      void check().then((update) => setUpdateAvailable(Boolean(update))).catch(() => undefined);
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, []);

  const openSettings = async () => {
    try {
      await invoke("open_settings");
    } catch (error) {
      console.error("打开设置失败", error);
    }
  };

  const manuallyRefresh = async () => {
    if (dragging.current || Date.now() < suppressButtonsUntil.current) return;
    await manualRefresh();
  };

  const buttonsAreEnabled = () => !dragging.current && Date.now() >= suppressButtonsUntil.current;

  const startDragging = async () => {
    if (!window.__TAURI_INTERNALS__ || dragging.current) return;
    const overlay = getCurrentWebviewWindow();
    dragging.current = true;
    const startPosition = await overlay.outerPosition().catch(() => null);
    try {
      await invoke("begin_overlay_drag");
      try {
        await overlay.startDragging();
      } finally {
        await invoke("end_overlay_drag");
      }
    } finally {
      const endPosition = await overlay.outerPosition().catch(() => null);
      const moved = startPosition && endPosition
        ? Math.abs(endPosition.x - startPosition.x) > 2 || Math.abs(endPosition.y - startPosition.y) > 2
        : true;
      if (moved) suppressButtonsUntil.current = Date.now() + 350;
      dragging.current = false;
    }
  };

  return (
    <main className="app-shell">
      <QuotaCapsule
        quota={quota}
        error={error}
        refreshing={refreshing}
        updateAvailable={updateAvailable}
        onManualRefresh={() => void manuallyRefresh()}
        onOpenSettings={() => {
          if (buttonsAreEnabled()) void openSettings();
        }}
        onStartDragging={() => void startDragging()}
      />
    </main>
  );
}

export default App;
