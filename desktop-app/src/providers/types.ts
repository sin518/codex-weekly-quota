export interface WeeklyQuota {
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number | null;
  resetCreditsAvailable: number | null;
  synced: boolean;
  syncedAt: string;
  source: "codex-app-server" | "mock" | "unavailable";
  syncError?: string;
}

export interface QuotaProvider {
  getWeeklyQuota(): Promise<WeeklyQuota>;
}
