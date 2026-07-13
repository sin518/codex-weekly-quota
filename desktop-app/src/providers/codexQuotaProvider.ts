import { invoke } from "@tauri-apps/api/core";
import type { QuotaProvider, WeeklyQuota } from "./types";

class CodexQuotaProvider implements QuotaProvider {
  async getWeeklyQuota(): Promise<WeeklyQuota> {
    return invoke<WeeklyQuota>("get_weekly_quota");
  }
}

export const codexQuotaProvider = new CodexQuotaProvider();
