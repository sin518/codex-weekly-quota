import { getUnavailableLabel } from "../providers/quotaErrors";
import type { QuotaReadError, WeeklyQuota } from "../providers/types";

export type IndicatorTone = "fresh" | "warning" | "error" | "demo";
export type ProgressTone = "normal" | "warning" | "danger";

export interface QuotaPresentation {
  loading: boolean;
  primaryText: string;
  statusText: string | null;
  details: string;
  accessibleText: string;
  indicatorTone: IndicatorTone | null;
  indicatorLabel: string;
  progressTone: ProgressTone;
}

export function buildQuotaPresentation(
  quota: WeeklyQuota | null,
  error: QuotaReadError | null,
  refreshing: boolean,
  now = Date.now(),
): QuotaPresentation {
  if (!quota && !error) {
    return {
      loading: true,
      primaryText: "正在读取七天额度…",
      statusText: null,
      details: "正在读取 Codex 七天额度",
      accessibleText: "正在读取 Codex 七天额度",
      indicatorTone: null,
      indicatorLabel: "",
      progressTone: "normal",
    };
  }

  if (!quota && error) {
    const label = getUnavailableLabel(error);
    return {
      loading: false,
      primaryText: label,
      statusText: null,
      details: `${label}\n原因：${error.userMessage}`,
      accessibleText: `${label}，原因：${error.userMessage}`,
      indicatorTone: "error",
      indicatorLabel: label,
      progressTone: "normal",
    };
  }

  const currentQuota = quota as WeeklyQuota;
  const isDemo = currentQuota.source === "mock";
  const isExpired = currentQuota.resetsAt !== null && currentQuota.resetsAt * 1000 <= now;
  const compactRange = formatCompactPeriod(currentQuota);

  let statusText = compactRange ?? "周期时间未知";
  if (isDemo) statusText = "演示数据";
  else if (isExpired && refreshing) statusText = "周期已结束，正在更新";
  else if (isExpired) statusText = compactRange ? `上一周期 ${compactRange}` : "上一周期数据";

  let indicatorTone: IndicatorTone = "fresh";
  let indicatorLabel = "额度数据已同步";
  if (isDemo) {
    indicatorTone = "demo";
    indicatorLabel = "演示数据";
  } else if (isExpired) {
    indicatorTone = "warning";
    indicatorLabel = refreshing ? "周期已结束，正在更新" : "上一周期数据";
  } else if (error) {
    indicatorTone = "warning";
    indicatorLabel = "额度更新失败，正在显示上次数据";
  } else if (refreshing) {
    indicatorTone = "warning";
    indicatorLabel = "正在刷新额度";
  } else if (currentQuota.resetsAt === null) {
    indicatorTone = "warning";
    indicatorLabel = "Codex 未返回重置时间";
  }

  const detailLines: string[] = [];
  if (isDemo) detailLines.push("演示数据：此数据仅用于界面预览");
  const fullPeriod = formatFullPeriod(currentQuota);
  detailLines.push(fullPeriod ? `当前额度周期：${fullPeriod}` : "当前额度周期：未知");
  detailLines.push(`已使用：${currentQuota.usedPercent}%`);
  if (currentQuota.resetCreditsAvailable !== null) {
    detailLines.push(`可重置：${currentQuota.resetCreditsAvailable} 次`);
  }
  detailLines.push(`最后同步：${formatFullLocalTime(currentQuota.syncedAt * 1000)}`);
  if (!isDemo && currentQuota.resetsAt === null) {
    detailLines.push("状态：Codex 未返回重置时间");
  }
  if (!isDemo && isExpired) {
    detailLines.push(refreshing ? "状态：周期已结束，正在更新" : "状态：上一周期数据");
  }
  if (!isDemo && error) {
    detailLines.push(`更新状态：${error.userMessage}`);
  } else if (!isDemo && refreshing && !isExpired) {
    detailLines.push("更新状态：正在刷新");
  }

  return {
    loading: false,
    primaryText: `已用 ${currentQuota.usedPercent}%`,
    statusText,
    details: detailLines.join("\n"),
    accessibleText: detailLines.join("，"),
    indicatorTone,
    indicatorLabel,
    progressTone: getProgressTone(currentQuota.usedPercent),
  };
}

function formatCompactPeriod(quota: WeeklyQuota): string | null {
  const period = getPeriodBoundary(quota);
  if (!period) return null;
  return `${formatCompactLocalDate(period.start)}–${formatCompactLocalDate(period.end)}`;
}

function formatFullPeriod(quota: WeeklyQuota): string | null {
  const period = getPeriodBoundary(quota);
  if (!period) return null;
  return `${formatFullLocalTime(period.start)} → ${formatFullLocalTime(period.end)}`;
}

function getPeriodBoundary(quota: WeeklyQuota): { start: number; end: number } | null {
  if (quota.resetsAt === null) return null;
  const end = quota.resetsAt * 1000;
  return {
    start: end - quota.windowDurationMins * 60_000,
    end,
  };
}

function formatCompactLocalDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
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
