export interface QuotaWindow {
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number | null;
}

export interface QuotaSnapshot {
  fiveHour: QuotaWindow | null;
  weekly: QuotaWindow;
  resetCreditsAvailable: number | null;
  syncedAt: number;
  source: "codex-app-server" | "mock";
}

export interface QuotaProvider {
  getQuota(): Promise<QuotaSnapshot>;
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
  | "five-hour-window-ambiguous"
  | "quota-data-invalid"
  | "unknown";

export interface QuotaReadError {
  code: QuotaErrorCode;
  userMessage: string;
}
