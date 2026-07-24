export interface WeeklyQuota {
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number | null;
  resetCreditsAvailable: number | null;
  syncedAt: number;
  source: "codex-app-server" | "mock";
}

export interface QuotaProvider {
  getWeeklyQuota(): Promise<WeeklyQuota>;
}

export type QuotaErrorCode =
  | "codex-cli-missing"
  | "app-server-unavailable"
  | "quota-read-timeout"
  | "not-signed-in"
  | "quota-response-error"
  | "quota-response-missing"
  | "weekly-window-missing"
  | "weekly-window-ambiguous"
  | "quota-data-invalid"
  | "unknown";

export interface QuotaReadError {
  code: QuotaErrorCode;
  userMessage: string;
}
