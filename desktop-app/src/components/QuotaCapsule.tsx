import type { WeeklyQuota } from "../providers/types";

interface QuotaCapsuleProps {
  quota: WeeklyQuota;
  updateAvailable: boolean;
  onOpenSettings: () => void;
}

export function QuotaCapsule({ quota, updateAvailable, onOpenSettings }: QuotaCapsuleProps) {
  const usedPercent = Math.min(100, Math.max(0, quota.usedPercent));
  const statusText = !quota.synced
    ? "同步失败"
    : quota.resetCreditsAvailable !== null
      ? `可重置 ${quota.resetCreditsAvailable} 次`
      : formatResetTime(quota.resetsAt);
  const percentageText = quota.synced ? `${usedPercent}%` : "--%";

  return (
    <section className="quota-capsule" aria-label={quota.synced ? `Codex 周额度已使用 ${usedPercent}%` : "Codex 周额度同步失败"}>
      <svg className="sparkle" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 1.8c.7 5.8 4.4 9.5 10.2 10.2-5.8.7-9.5 4.4-10.2 10.2C11.3 16.4 7.6 12.7 1.8 12 7.6 11.3 11.3 7.6 12 1.8Z" />
      </svg>
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPercent}>
        <div className="progress-fill" style={{ width: `${usedPercent}%` }} />
      </div>
      <strong className="percentage">{percentageText}</strong>
      <span className="separator" aria-hidden="true" />
      <span className="reset-count">{statusText}</span>
      <span className="sync-dot" data-synced={quota.synced} title={quota.synced ? "已同步" : quota.syncError ?? "同步失败"} />
      <button className="settings-button" type="button" onClick={onOpenSettings} aria-label="打开设置" title="设置">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9.6 3.1h4.8l.5 2.1c.5.2 1 .5 1.5.9l2-.7 2.4 4.2-1.6 1.4a7 7 0 0 1 0 2l1.6 1.4-2.4 4.2-2-.7c-.5.4-1 .7-1.5.9l-.5 2.1H9.6l-.5-2.1a8 8 0 0 1-1.5-.9l-2 .7-2.4-4.2L4.8 13a7 7 0 0 1 0-2L3.2 9.6l2.4-4.2 2 .7c.5-.4 1-.7 1.5-.9l.5-2.1Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.7" />
        </svg>
        {updateAvailable && <span className="update-badge" />}
      </button>
    </section>
  );
}

function formatResetTime(resetsAt: number | null): string {
  if (!resetsAt) return "额度已同步";
  const remainingMinutes = Math.max(0, Math.ceil((resetsAt * 1000 - Date.now()) / 60_000));
  const days = Math.floor(remainingMinutes / 1_440);
  const hours = Math.ceil((remainingMinutes % 1_440) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时后重置`;
  return `${hours} 小时后重置`;
}
