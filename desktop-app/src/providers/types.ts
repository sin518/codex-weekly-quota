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

export type QuotaSource = "codex" | "deepseek";

export interface DeepSeekBalanceInfo {
  currency: string;
  totalBalance: string;
  grantedBalance: string;
  toppedUpBalance: string;
}

export interface DeepSeekBalanceSnapshot {
  isAvailable: boolean;
  balances: DeepSeekBalanceInfo[];
  syncedAt: number;
  source: "deepseek-api" | "mock";
}

export interface DeepSeekConfigStatus {
  configured: boolean;
  baseUrl: string | null;
  rememberApiKey: boolean;
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
  | "deepseek-not-configured"
  | "deepseek-api-key-missing"
  | "deepseek-invalid-url"
  | "deepseek-state-error"
  | "deepseek-auth-error"
  | "deepseek-http-error"
  | "deepseek-response-error"
  | "deepseek-network-error"
  | "deepseek-balance-missing"
  | "unknown";

export interface QuotaReadError {
  code: QuotaErrorCode;
  userMessage: string;
}
