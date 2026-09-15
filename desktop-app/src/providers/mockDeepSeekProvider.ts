import type { DeepSeekBalanceSnapshot } from "./types";

class MockDeepSeekProvider {
  async getBalance(_baseUrl: string): Promise<DeepSeekBalanceSnapshot> {
    return {
      isAvailable: true,
      balances: [
        {
          currency: "CNY",
          totalBalance: "86.00",
          grantedBalance: "10.00",
          toppedUpBalance: "76.00",
        },
      ],
      syncedAt: Math.floor(Date.now() / 1000),
      source: "mock",
    };
  }

  async saveConfig(): Promise<DeepSeekBalanceSnapshot> {
    return this.getBalance("");
  }

  async getConfigStatus(): Promise<{ configured: boolean; baseUrl: string | null; rememberApiKey: boolean }> {
    return { configured: true, baseUrl: null, rememberApiKey: false };
  }

  async clearConfig(): Promise<void> {
    return undefined;
  }
}

export const mockDeepSeekProvider = new MockDeepSeekProvider();
