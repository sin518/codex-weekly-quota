import { useEffect, useState } from "react";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import "./App.css";
import { QuotaCapsule } from "./components/QuotaCapsule";
import { SettingsScreen } from "./components/SettingsScreen";
import { codexQuotaProvider } from "./providers/codexQuotaProvider";
import { mockQuotaProvider } from "./providers/mockQuotaProvider";
import type { WeeklyQuota } from "./providers/types";
import { getUpdateStrategy } from "./updates/preferences";

function App() {
  const previewLabel = new URLSearchParams(window.location.search).get("window");
  const windowLabel = window.__TAURI_INTERNALS__
    ? getCurrentWebviewWindow().label
    : previewLabel === "settings" ? "settings" : "quota-overlay";
  return windowLabel === "settings" ? <SettingsScreen /> : <QuotaOverlay />;
}

function QuotaOverlay() {
  const [quota, setQuota] = useState<WeeklyQuota | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const provider = window.__TAURI_INTERNALS__ ? codexQuotaProvider : mockQuotaProvider;
        const nextQuota = await provider.getWeeklyQuota();
        if (active) setQuota(nextQuota);
      } catch (error) {
        if (active) {
          if (!window.__TAURI_INTERNALS__) {
            setQuota(await mockQuotaProvider.getWeeklyQuota());
          } else {
            setQuota({
              usedPercent: 0,
              windowDurationMins: 0,
              resetsAt: null,
              resetCreditsAvailable: null,
              synced: false,
              syncedAt: new Date().toISOString(),
              source: "unavailable",
              syncError: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__ || getUpdateStrategy() !== "automatic") return;
    const timer = window.setTimeout(() => {
      void check().then((update) => setUpdateAvailable(Boolean(update))).catch(() => undefined);
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, []);

  const openSettings = async () => {
    const settings = await WebviewWindow.getByLabel("settings");
    if (!settings) return;
    await settings.center();
    await settings.show();
    await settings.setFocus();
  };

  const startDragging = async () => {
    if (!window.__TAURI_INTERNALS__) return;
    const overlay = getCurrentWebviewWindow();
    await invoke("begin_overlay_drag");
    try {
      await overlay.startDragging();
    } finally {
      await invoke("end_overlay_drag");
    }
  };

  return (
    <main className="app-shell">
      {quota ? (
        <QuotaCapsule
          quota={quota}
          updateAvailable={updateAvailable}
          onOpenSettings={() => void openSettings()}
          onStartDragging={() => void startDragging()}
        />
      ) : (
        <div className="loading-pill" />
      )}
    </main>
  );
}

export default App;
