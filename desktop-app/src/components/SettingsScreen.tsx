import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import {
  getUpdateStrategy,
  setUpdateStrategy,
  type UpdateStrategy,
} from "../updates/preferences";
import {
  DEEPSEEK_CONFIG_CHANGED_EVENT,
  QUOTA_SOURCE_CHANGED_EVENT,
  getDeepSeekBaseUrl,
  getDeepSeekRemember,
  getDeepSeekTopUp,
  getQuotaSource,
  setDeepSeekBaseUrl,
  setDeepSeekRemember,
  setDeepSeekTopUp,
  setQuotaSource,
} from "../preferences/quotaSource";
import { deepseekQuotaProvider } from "../providers/deepseekQuotaProvider";
import type { DeepSeekBalanceSnapshot, QuotaSource } from "../providers/types";

type UpdateState = "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "error";
type DeepSeekSaveState = "idle" | "saving" | "success" | "error";

export function SettingsScreen() {
  const [strategy, setStrategy] = useState<UpdateStrategy>(getUpdateStrategy());
  const [version, setVersion] = useState("—");
  const [state, setState] = useState<UpdateState>("idle");
  const [message, setMessage] = useState("点击按钮检查 GitHub Releases");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);

  const [quotaSource, setQuotaSourceLocal] = useState<QuotaSource>(() => getQuotaSource());
  const [baseUrl, setBaseUrl] = useState(() => getDeepSeekBaseUrl());
  const [topUpInput, setTopUpInput] = useState(() => getDeepSeekTopUp());
  const [rememberApiKey, setRememberApiKey] = useState(() => getDeepSeekRemember());
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [deepseekState, setDeepseekState] = useState<DeepSeekSaveState>("idle");
  const [deepseekMessage, setDeepseekMessage] = useState("");
  const [deepseekConfigured, setDeepseekConfigured] = useState(false);

  useEffect(() => {
    void getVersion().then(setVersion).catch(() => setVersion("开发预览"));
  }, []);

  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") void close();
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, []);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;
    let active = true;
    deepseekQuotaProvider.getConfigStatus().then((status) => {
      if (!active) return;
      setDeepseekConfigured(status.configured);
      if (status.baseUrl) setBaseUrl(status.baseUrl);
      setRememberApiKey(status.rememberApiKey);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const changeStrategy = (next: UpdateStrategy) => {
    setStrategy(next);
    setUpdateStrategy(next);
  };

  const chooseQuotaSource = (next: QuotaSource) => {
    setQuotaSourceLocal(next);
    setQuotaSource(next);
    if (window.__TAURI_INTERNALS__) {
      void emit(QUOTA_SOURCE_CHANGED_EVENT).catch(() => undefined);
    }
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

  const saveDeepSeekConfig = async () => {
    if (!apiKeyInput.trim() && !deepseekConfigured) {
      setDeepseekState("error");
      setDeepseekMessage("请输入 API Key");
      return;
    }
    setDeepseekState("saving");
    setDeepseekMessage("正在验证并保存…");
    try {
      let result;
      if (!apiKeyInput.trim() && deepseekConfigured) {
        result = await deepseekQuotaProvider.getBalance(baseUrl.trim());
      } else {
        result = await deepseekQuotaProvider.saveConfig(baseUrl.trim(), apiKeyInput.trim(), rememberApiKey);
      }
      setDeepSeekBaseUrl(baseUrl);
      setDeepSeekTopUp(topUpInput);
      setDeepSeekRemember(rememberApiKey);
      setApiKeyInput("");
      setDeepseekConfigured(true);
      setDeepseekState("success");
      setDeepseekMessage(`保存成功，余额 ${formatBalance(result)}`);
      if (window.__TAURI_INTERNALS__) {
        await emit(DEEPSEEK_CONFIG_CHANGED_EVENT);
      }
    } catch (error) {
      setDeepseekState("error");
      setDeepseekMessage(formatDeepSeekError(error));
    }
  };

  const clearDeepSeekConfig = async () => {
    try {
      await deepseekQuotaProvider.clearConfig();
      setDeepseekConfigured(false);
      setApiKeyInput("");
      setDeepseekMessage("已清除 DeepSeek 配置");
      if (window.__TAURI_INTERNALS__) {
        await emit(DEEPSEEK_CONFIG_CHANGED_EVENT);
      }
    } catch (error) {
      setDeepseekMessage(formatDeepSeekError(error));
    }
  };

  const close = async () => {
    try {
      await invoke("close_settings");
    } catch (error) {
      console.error("关闭设置失败", error);
    }
  };
  const versionLabel = version === "—" || version === "开发预览" ? version : `v${version}`;

  return (
    <main className="settings-shell">
      <header className="settings-header" data-tauri-drag-region>
        <div>
          <p className="eyebrow">CODEX WEEKLY QUOTA</p>
          <div className="settings-title-row">
            <h1>设置</h1>
            <span className="version-badge">{versionLabel}</span>
          </div>
        </div>
        <button className="close-button" type="button" onClick={() => void close()} aria-label="关闭设置">×</button>
      </header>

      <section className="settings-card">
        <div className="setting-copy">
          <strong>检查更新</strong>
          <span>当前版本 {versionLabel}</span>
        </div>
        <div className="strategy-options" role="radiogroup" aria-label="更新检查策略">
          <button className="strategy-option" type="button" role="radio" aria-checked={strategy === "automatic"} onClick={() => changeStrategy("automatic")}>
            <span className="radio-indicator" aria-hidden="true" />
            <span className="strategy-copy"><b>启动时自动检查</b><small>发现新版时在设置按钮显示提示</small></span>
          </button>
          <button className="strategy-option" type="button" role="radio" aria-checked={strategy === "manual"} onClick={() => changeStrategy("manual")}>
            <span className="radio-indicator" aria-hidden="true" />
            <span className="strategy-copy"><b>仅手动检查</b><small>只在点击检查按钮时联网</small></span>
          </button>
        </div>
      </section>

      <section className="settings-card">
        <div className="setting-copy">
          <strong>额度来源</strong>
          <span>选择悬浮窗显示的数据</span>
        </div>
        <div className="strategy-options" role="radiogroup" aria-label="额度来源">
          <button className="strategy-option" type="button" role="radio" aria-checked={quotaSource === "codex"} onClick={() => chooseQuotaSource("codex")}>
            <span className="radio-indicator" aria-hidden="true" />
            <span className="strategy-copy"><b>Codex</b><small>五小时与七天额度</small></span>
          </button>
          <button className="strategy-option" type="button" role="radio" aria-checked={quotaSource === "deepseek"} onClick={() => chooseQuotaSource("deepseek")}>
            <span className="radio-indicator" aria-hidden="true" />
            <span className="strategy-copy"><b>DeepSeek</b><small>余额与消费进度</small></span>
          </button>
        </div>

        {quotaSource === "deepseek" && (
          <div className="deepseek-fields">
            <label className="field-label">API URL</label>
            <input className="credential-input" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.deepseek.com" spellCheck={false} />
            <label className="field-label">API Key</label>
            <input className="credential-input" type="password" value={apiKeyInput} onChange={(event) => setApiKeyInput(event.target.value)} placeholder={deepseekConfigured ? "已配置，留空表示沿用" : "sk-..."} autoComplete="off" />
            <label className="field-label">充值总额（元）</label>
            <input className="credential-input" value={topUpInput} onChange={(event) => setTopUpInput(event.target.value)} placeholder="例如 100" inputMode="decimal" />
            <label className="checkbox-row">
              <input type="checkbox" checked={rememberApiKey} onChange={(event) => setRememberApiKey(event.target.checked)} />
              <span>记住 API Key（安全保存到系统钥匙串，重启后仍有效）</span>
            </label>
            <button className="primary-button" type="button" disabled={deepseekState === "saving"} onClick={() => void saveDeepSeekConfig()}>
              {deepseekState === "saving" ? "保存并测试中…" : "保存并测试"}
            </button>
            <button className="ghost-button" type="button" onClick={() => void clearDeepSeekConfig()}>清除配置</button>
            <p className="deepseek-note">API Key 默认不写入磁盘；勾选“记住”后保存在系统钥匙串中。</p>
            {deepseekMessage && <p className="deepseek-status">{deepseekMessage}</p>}
          </div>
        )}
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

function formatDeepSeekError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return `DeepSeek 保存失败：${raw}`;
}

function formatBalance(balance: DeepSeekBalanceSnapshot): string {
  const primary = balance.balances[0];
  if (!primary) return "未知余额";
  const symbol = primary.currency === "CNY" ? "¥" : primary.currency === "USD" ? "$" : `${primary.currency} `;
  return `${symbol}${primary.totalBalance}`;
}
