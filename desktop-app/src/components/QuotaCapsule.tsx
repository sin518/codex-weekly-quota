import type { QuotaReadError, WeeklyQuota } from "../providers/types";
import { buildQuotaPresentation } from "./quotaPresentation";

interface QuotaCapsuleProps {
  quota: WeeklyQuota | null;
  error: QuotaReadError | null;
  refreshing: boolean;
  updateAvailable: boolean;
  onManualRefresh: () => void;
  onOpenSettings: () => void;
  onStartDragging: () => void;
}

export function QuotaCapsule({
  quota,
  error,
  refreshing,
  updateAvailable,
  onManualRefresh,
  onOpenSettings,
  onStartDragging,
}: QuotaCapsuleProps) {
  const presentation = buildQuotaPresentation(quota, error, refreshing);

  return (
    <section
      className="quota-capsule"
      aria-label="Codex 七天额度"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const button = (event.target as HTMLElement).closest("button");
        if (button && !button.classList.contains("refresh-button")) return;
        onStartDragging();
      }}
    >
      <button
        className="refresh-button"
        type="button"
        data-refreshing={refreshing}
        aria-label="立即刷新额度"
        aria-busy={refreshing}
        disabled={refreshing}
        title="刷新额度"
        onClick={onManualRefresh}
      >
        <svg className="sparkle" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 1.8c.7 5.8 4.4 9.5 10.2 10.2-5.8.7-9.5 4.4-10.2 10.2C11.3 16.4 7.6 12.7 1.8 12 7.6 11.3 11.3 7.6 12 1.8Z" />
        </svg>
      </button>
      <div
        className="quota-information"
        data-loading={presentation.loading}
        tabIndex={presentation.loading ? undefined : 0}
        title={presentation.loading ? undefined : presentation.details}
        role={presentation.loading ? "status" : "group"}
        aria-live={presentation.loading ? "polite" : undefined}
        aria-busy={presentation.loading || refreshing}
        aria-label={presentation.accessibleText}
      >
        {quota && (
          <div
            className="progress-track"
            data-tone={presentation.progressTone}
            role="progressbar"
            aria-label={`七天额度已使用 ${quota.usedPercent}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={quota.usedPercent}
          >
            <div className="progress-fill" style={{ width: `${quota.usedPercent}%` }} />
          </div>
        )}
        <strong className={quota ? "percentage" : "status-message"}>{presentation.primaryText}</strong>
        {presentation.statusText && (
          <>
            <span className="separator" aria-hidden="true" />
            <span className="period-copy">{presentation.statusText}</span>
          </>
        )}
      </div>
      {presentation.indicatorTone && (
        <span
          className="sync-dot"
          data-tone={presentation.indicatorTone}
          title={presentation.indicatorLabel}
          aria-label={presentation.indicatorLabel}
          role="status"
        />
      )}
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
