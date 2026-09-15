import { invoke } from "@tauri-apps/api/core";
import type {
  DeepSeekBalanceSnapshot,
  DeepSeekConfigStatus,
} from "./types";

class DeepSeekQuotaProvider {
  async getBalance(baseUrl: string): Promise<DeepSeekBalanceSnapshot> {
    return invoke<DeepSeekBalanceSnapshot>("get_deepseek_balance", { baseUrl });
  }

  async saveConfig(
    baseUrl: string,
    apiKey: string,
    rememberApiKey: boolean,
  ): Promise<DeepSeekBalanceSnapshot> {
    return invoke<DeepSeekBalanceSnapshot>("save_deepseek_config", {
      baseUrl,
      apiKey,
      rememberApiKey,
    });
  }

  async getConfigStatus(): Promise<DeepSeekConfigStatus> {
    return invoke<DeepSeekConfigStatus>("get_deepseek_config_status");
  }

  async clearConfig(): Promise<void> {
    return invoke("clear_deepseek_config");
  }
}

export const deepseekQuotaProvider = new DeepSeekQuotaProvider();
