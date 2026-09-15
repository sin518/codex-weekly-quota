import { getUnavailableLabel } from "../providers/quotaErrors";
import type {
  DeepSeekBalanceSnapshot,
  QuotaReadError,
  QuotaSnapshot,
  QuotaSource,
  QuotaWindow,
} from "../providers/types";

export type IndicatorTone = "fresh" | "warning" | "error" | "demo";
export type ProgressTone = "normal" | "warning" | "danger";

export interface QuotaWindowPresentation {
  key: string;
  label: string;
  quota: QuotaWindow | null;
  valueText: string;
  details: string;
  progressTone: ProgressTone;
}

export interface QuotaPresentation {
  loading: boolean;
  messageText: string | null;
  windows: QuotaWindowPresentation[];
  details: string;
  accessibleText: string;
  indicatorTone: IndicatorTone | null;
  indicatorLabel: string;
}

export function buildQuotaPresentation(
  source: QuotaSource,
  quota: QuotaSnapshot | null,
  balance: DeepSeekBalanceSnapshot | null,
  topUp: number,
  error: QuotaReadError | null,
  refreshing: boolean,
  now = Date.now(),
): QuotaPresentation {
  if (source === "deepseek") {
    return buildDeepSeekPresentation(balance, topUp, error, refreshing);
  }
  return buildCodexPresentation(quota, error, refreshing, now);
}

function buildCodexPresentation(
  quota: QuotaSnapshot | null,
  error: QuotaReadError | null,
  _refreshing: boolean,
  now: number,
): QuotaPresentation {
  if (!quota && !error) {
    return { loading: true, messageText: "正在读取额度…", windows: [], details: "正在读取 Codex 额度", accessibleText: "正在读取 Codex 额度", indicatorTone: null, indicatorLabel: "" };
  }
  if (!quota && error) {
    const label = getUnavailableLabel(error);
    return { loading: false, messageText: label, windows: [], details: `${label}\n原因：${error.userMessage}`, accessibleText: `${label}，原因：${error.userMessage}`, indicatorTone: "error", indicatorLabel: label };
  }
  const current = quota as QuotaSnapshot;
  const windows = [
    buildCodexWindow("five-hour", "5小时", current.fiveHour, now),
    buildCodexWindow("weekly", "7天", current.weekly, now),
  ];
  return { loading: false, messageText: null, windows, details: windows.map(w => w.details).join("\n"), accessibleText: windows.map(w => w.details).join("，"), indicatorTone: "fresh", indicatorLabel: "Codex 额度已同步" };
}

function buildCodexWindow(key: QuotaWindowPresentation["key"], label: string, quota: QuotaWindow | null, _now: number): QuotaWindowPresentation {
  if (!quota) return { key, label, quota: null, valueText: "--", details: `${label}：暂无`, progressTone: "normal" };
  const item = quota as QuotaWindow;
  const value = `${item.usedPercent}%`;
  return { key, label, quota: item, valueText: value, details: `${label}额度已使用 ${value}`, progressTone: getProgressTone(item.usedPercent) };
}

function buildDeepSeekPresentation(
  balance: DeepSeekBalanceSnapshot | null,
  topUp: number,
  error: QuotaReadError | null,
  _refreshing: boolean,
): QuotaPresentation {
  if (!balance && !error) {
    return { loading: true, messageText: "正在读取余额…", windows: [], details: "正在读取 DeepSeek 余额", accessibleText: "正在读取 DeepSeek 余额", indicatorTone: null, indicatorLabel: "" };
  }
  if (!balance && error) {
    const label = getUnavailableLabel(error);
    return { loading: false, messageText: label, windows: [], details: `${label}\n原因：${error.userMessage}`, accessibleText: `${label}，原因：${error.userMessage}`, indicatorTone: "error", indicatorLabel: label };
  }
  if (topUp <= 0) {
    return { loading: false, messageText: "请在设置中填写充值总额", windows: [], details: "请在设置中填写 DeepSeek 充值总额", accessibleText: "请在设置中填写 DeepSeek 充值总额", indicatorTone: "warning", indicatorLabel: "缺少充值总额" };
  }

  const current = balance as DeepSeekBalanceSnapshot;
  const primary = current.balances[0];
  const currentBalance = primary ? Number(primary.totalBalance) || 0 : 0;
  const spend = Math.max(0, topUp - currentBalance);
  const balancePercent = topUp > 0 ? Math.max(0, Math.min(100, (currentBalance / topUp) * 100)) : 0;
  const spendPercent = topUp > 0 ? Math.max(0, Math.min(100, (spend / topUp) * 100)) : 0;

  const windows: QuotaWindowPresentation[] = [
    { key: "balance", label: "余额", quota: { usedPercent: Math.round(balancePercent), windowDurationMins: 1, resetsAt: null }, valueText: `${Math.round(balancePercent)}%`, details: `DeepSeek 余额：${formatAmount(primary?.currency, currentBalance)}`, progressTone: getProgressTone(balancePercent) },
    { key: "spend", label: "消费", quota: { usedPercent: Math.round(spendPercent), windowDurationMins: 1, resetsAt: null }, valueText: `${Math.round(spendPercent)}%`, details: `累计消费：${formatAmount(primary?.currency, spend)}`, progressTone: getProgressTone(spendPercent) },
  ];

  const details = windows.map((item) => item.details).join("\n");
  return { loading: false, messageText: null, windows, details, accessibleText: details.replace(/\n/g, "，"), indicatorTone: current.isAvailable ? "fresh" : "warning", indicatorLabel: current.isAvailable ? "DeepSeek 余额已同步" : "DeepSeek 余额不足" };
}

function formatAmount(currency: string | undefined, amount: number): string {
  const symbol = currency === "CNY" ? "¥" : currency === "USD" ? "$" : currency ? `${currency} ` : "";
  return `${symbol}${amount.toFixed(2)}`;
}

function getProgressTone(usedPercent: number): ProgressTone {
  if (usedPercent >= 100) return "danger";
  if (usedPercent >= 80) return "warning";
  return "normal";
}
