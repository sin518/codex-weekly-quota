import { getUnavailableLabel } from "../providers/quotaErrors";
import type { QuotaReadError, QuotaSnapshot, QuotaWindow } from "../providers/types";

export type IndicatorTone = "fresh" | "warning" | "error" | "demo";
export type ProgressTone = "normal" | "warning" | "danger";

export interface QuotaWindowPresentation {
  key: "five-hour" | "weekly";
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
  quota: QuotaSnapshot | null,
  error: QuotaReadError | null,
  refreshing: boolean,
  now = Date.now(),
): QuotaPresentation {
  if (!quota && !error) {
    return {
      loading: true,
      messageText: "正在读取额度…",
      windows: [],
      details: "正在读取 Codex 五小时和七天额度",
      accessibleText: "正在读取 Codex 五小时和七天额度",
      indicatorTone: null,
      indicatorLabel: "",
    };
  }

  if (!quota && error) {
    const label = getUnavailableLabel(error);
    return {
      loading: false,
      messageText: label,
      windows: [],
      details: `${label}\n原因：${error.userMessage}`,
      accessibleText: `${label}，原因：${error.userMessage}`,
      indicatorTone: "error",
      indicatorLabel: label,
    };
  }

  const currentQuota = quota as QuotaSnapshot;
  const isDemo = currentQuota.source === "mock";
  const windows = [
    buildWindowPresentation("five-hour", "5小时", currentQuota.fiveHour, now),
    buildWindowPresentation("weekly", "7天", currentQuota.weekly, now),
  ];
  const availableWindows = windows.filter(
    (window): window is QuotaWindowPresentation & { quota: QuotaWindow } => window.quota !== null,
  );
  const hasExpiredWindow = availableWindows.some(
    (window) => window.quota.resetsAt !== null && window.quota.resetsAt * 1000 <= now,
  );
  const hasUnknownReset = availableWindows.some((window) => window.quota.resetsAt === null);

  let indicatorTone: IndicatorTone = "fresh";
  let indicatorLabel = "五小时和七天额度已同步";
  if (isDemo) {
    indicatorTone = "demo";
    indicatorLabel = "演示数据";
  } else if (hasExpiredWindow) {
    indicatorTone = "warning";
    indicatorLabel = refreshing ? "额度周期已结束，正在更新" : "正在显示上一周期数据";
  } else if (error) {
    indicatorTone = "warning";
    indicatorLabel = "额度更新失败，正在显示上次数据";
  } else if (refreshing) {
    indicatorTone = "warning";
    indicatorLabel = "正在刷新额度";
  } else if (currentQuota.fiveHour === null) {
    indicatorTone = "warning";
    indicatorLabel = "Codex 尚未返回五小时额度";
  } else if (hasUnknownReset) {
    indicatorTone = "warning";
    indicatorLabel = "Codex 未返回完整的重置时间";
  }

  const detailLines = windows.map((window) => window.details);
  if (isDemo) detailLines.unshift("演示数据：此数据仅用于界面预览");
  if (currentQuota.resetCreditsAvailable !== null) {
    detailLines.push(`可重置：${currentQuota.resetCreditsAvailable} 次`);
  }
  detailLines.push(`最后同步：${formatFullLocalTime(currentQuota.syncedAt * 1000)}`);
  if (!isDemo && error) detailLines.push(`更新状态：${error.userMessage}`);
  else if (!isDemo && refreshing) detailLines.push("更新状态：正在刷新");

  return {
    loading: false,
    messageText: null,
    windows,
    details: detailLines.join("\n"),
    accessibleText: detailLines.join("，"),
    indicatorTone,
    indicatorLabel,
  };
}

function buildWindowPresentation(
  key: QuotaWindowPresentation["key"],
  label: string,
  quota: QuotaWindow | null,
  now: number,
): QuotaWindowPresentation {
  if (!quota) {
    return {
      key,
      label,
      quota: null,
      valueText: "--",
      details: `${label}额度：Codex 尚未返回`,
      progressTone: "normal",
    };
  }

  const isExpired = quota.resetsAt !== null && quota.resetsAt * 1000 <= now;
  const detailLines = [`${label}额度已使用：${quota.usedPercent}%`];
  const fullPeriod = formatFullPeriod(quota);
  detailLines.push(fullPeriod ? `额度周期：${fullPeriod}` : "额度周期：未知");
  if (isExpired) detailLines.push("状态：上一周期数据");

  return {
    key,
    label,
    quota,
    valueText: `${quota.usedPercent}%`,
    details: detailLines.join("\n"),
    progressTone: getProgressTone(quota.usedPercent),
  };
}

function formatFullPeriod(quota: QuotaWindow): string | null {
  if (quota.resetsAt === null) return null;
  const end = quota.resetsAt * 1000;
  const start = end - quota.windowDurationMins * 60_000;
  return `${formatFullLocalTime(start)} → ${formatFullLocalTime(end)}`;
}

function formatFullLocalTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${hours}:${minutes}`;
}

function getProgressTone(usedPercent: number): ProgressTone {
  if (usedPercent === 100) return "danger";
  if (usedPercent >= 80) return "warning";
  return "normal";
}
