import type { QuotaProvider, QuotaSnapshot } from "./types";

class MockQuotaProvider implements QuotaProvider {
  async getQuota(): Promise<QuotaSnapshot> {
    return {
      fiveHour: {
        usedPercent: 36,
        windowDurationMins: 300,
        resetsAt: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
      },
      weekly: {
        usedPercent: 68,
        windowDurationMins: 10_080,
        resetsAt: Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60,
      },
      resetCreditsAvailable: 3,
      syncedAt: Math.floor(Date.now() / 1000),
      source: "mock",
    };
  }
}

export const mockQuotaProvider = new MockQuotaProvider();
