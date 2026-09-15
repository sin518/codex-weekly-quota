import type { QuotaSource } from "../providers/types";

const SOURCE_KEY = "codex-weekly-quota.quota-source";
const DEEPSEEK_BASE_URL_KEY = "codex-weekly-quota.deepseek-base-url";
const DEEPSEEK_TOPUP_KEY = "codex-weekly-quota.deepseek-topup";
const DEEPSEEK_REMEMBER_KEY = "codex-weekly-quota.deepseek-remember";

export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const QUOTA_SOURCE_CHANGED_EVENT = "quota-source-changed";
export const DEEPSEEK_CONFIG_CHANGED_EVENT = "deepseek-config-changed";

export function getQuotaSource(): QuotaSource {
  return localStorage.getItem(SOURCE_KEY) === "deepseek" ? "deepseek" : "codex";
}

export function setQuotaSource(source: QuotaSource): void {
  localStorage.setItem(SOURCE_KEY, source);
}

export function getDeepSeekBaseUrl(): string {
  return localStorage.getItem(DEEPSEEK_BASE_URL_KEY) ?? DEFAULT_DEEPSEEK_BASE_URL;
}

export function setDeepSeekBaseUrl(baseUrl: string): void {
  localStorage.setItem(DEEPSEEK_BASE_URL_KEY, baseUrl.trim());
}

export function getDeepSeekTopUp(): string {
  return localStorage.getItem(DEEPSEEK_TOPUP_KEY) ?? "0";
}

export function setDeepSeekTopUp(value: string): void {
  localStorage.setItem(DEEPSEEK_TOPUP_KEY, value.replace(/[^0-9.]/g, ""));
}

export function getDeepSeekRemember(): boolean {
  return localStorage.getItem(DEEPSEEK_REMEMBER_KEY) === "1";
}

export function setDeepSeekRemember(value: boolean): void {
  localStorage.setItem(DEEPSEEK_REMEMBER_KEY, value ? "1" : "0");
}
