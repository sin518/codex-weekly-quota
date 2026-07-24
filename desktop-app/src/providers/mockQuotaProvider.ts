import type { QuotaProvider, WeeklyQuota } from "./types";

class MockQuotaProvider implements QuotaProvider {
  async getWeeklyQuota(): Promise<WeeklyQuota> {
    return {
      usedPercent: 68,
      windowDurationMins: 10_080,
      resetsAt: Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60,
      resetCreditsAvailable: 3,
      syncedAt: Math.floor(Date.now() / 1000),
      source: "mock",
    };
  }
}

export const mockQuotaProvider = new MockQuotaProvider();
