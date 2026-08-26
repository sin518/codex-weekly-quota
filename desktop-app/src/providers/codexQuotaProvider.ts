import { invoke } from "@tauri-apps/api/core";
import type { QuotaProvider, QuotaSnapshot } from "./types";

class CodexQuotaProvider implements QuotaProvider {
  async getQuota(): Promise<QuotaSnapshot> {
    return invoke<QuotaSnapshot>("get_codex_quota");
  }
}

export const codexQuotaProvider = new CodexQuotaProvider();
