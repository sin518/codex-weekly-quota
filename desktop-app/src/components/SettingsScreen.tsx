import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  getUpdateStrategy,
  setUpdateStrategy,
  type UpdateStrategy,
} from "../updates/preferences";

type UpdateState = "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "error";

export function SettingsScreen() {
  const [strategy, setStrategy] = useState<UpdateStrategy>(getUpdateStrategy());
  const [version, setVersion] = useState("—");
  const [state, setState] = useState<UpdateState>("idle");
  const [message, setMessage] = useState("点击按钮检查 GitHub Releases");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);

  useEffect(() => {
    void getVersion().then(setVersion).catch(() => setVersion("开发预览"));
  }, []);

  const changeStrategy = (next: UpdateStrategy) => {
    setStrategy(next);
    setUpdateStrategy(next);
  };

  const checkForUpdates = async () => {
    setState("checking");
    setMessage("正在连接 GitHub 检查更新…");
    try {
      const update = await check();
      if (!update) {
        setPendingUpdate(null);
        setState("current");
        setMessage("当前已经是最新版本");
        return;
      }
      setPendingUpdate(update);
      setState("available");
      setMessage(`发现新版本 ${update.version}`);
    } catch (error) {
      setState("error");
      setMessage(formatUpdateError(error));
    }
  };

  const installUpdate = async () => {
    if (!pendingUpdate) return;
    setState("downloading");
    setMessage("正在安全下载并验证更新…");
    try {
      await pendingUpdate.downloadAndInstall();
      setState("ready");
      setMessage("更新已安装，正在重新启动…");
      await relaunch();
    } catch (error) {
      setState("error");
      setMessage(formatUpdateError(error));
    }
  };

  const close = () => void getCurrentWebviewWindow().hide();

  return (
    <main className="settings-shell">
      <header className="settings-header" data-tauri-drag-region>
        <div>
          <p className="eyebrow">CODEX WEEKLY QUOTA</p>
          <h1>设置</h1>
        </div>
        <button className="close-button" type="button" onClick={close} aria-label="关闭设置">×</button>
      </header>

      <section className="settings-card">
        <div className="setting-copy">
          <strong>检查更新</strong>
          <span>当前版本 {version}</span>
        </div>
        <div className="strategy-options" role="radiogroup" aria-label="更新检查策略">
          <label>
            <input type="radio" name="strategy" checked={strategy === "automatic"} onChange={() => changeStrategy("automatic")} />
            <span><b>启动时自动检查</b><small>发现新版时在设置按钮显示提示</small></span>
          </label>
          <label>
            <input type="radio" name="strategy" checked={strategy === "manual"} onChange={() => changeStrategy("manual")} />
            <span><b>仅手动检查</b><small>只在点击检查按钮时联网</small></span>
          </label>
        </div>
      </section>

      <footer className="settings-footer">
        <div className={`update-status status-${state}`}>{message}</div>
        {state === "available" ? (
          <button className="primary-button" type="button" onClick={() => void installUpdate()}>下载并安装</button>
        ) : (
          <button className="primary-button" type="button" disabled={state === "checking" || state === "downloading"} onClick={() => void checkForUpdates()}>
            {state === "checking" ? "检查中…" : "立即检查"}
          </button>
        )}
      </footer>
    </main>
  );
}

function formatUpdateError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes("404")) return "尚未发布更新清单 latest.json";
  return `检查失败：${raw}`;
}
