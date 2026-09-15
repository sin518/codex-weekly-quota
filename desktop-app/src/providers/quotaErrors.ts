import type { QuotaErrorCode, QuotaReadError } from "./types";

const USER_MESSAGES: Record<QuotaErrorCode, string> = {
  "codex-cli-missing": "找不到 Codex CLI",
  "app-server-unavailable": "Codex 额度服务暂不可用",
  "quota-read-timeout": "读取超时",
  "not-signed-in": "未登录 Codex",
  "quota-response-error": "Codex 额度服务返回错误",
  "quota-response-missing": "Codex 未返回额度数据",
  "weekly-window-missing": "Codex 未返回七天额度",
  "weekly-window-ambiguous": "Codex 返回了多个七天额度窗口",
  "five-hour-window-ambiguous": "Codex 返回了多个五小时额度窗口",
  "quota-data-invalid": "Codex 返回的额度数据不完整",
  "deepseek-not-configured": "请先在设置中配置 DeepSeek",
  "deepseek-api-key-missing": "请输入 DeepSeek API Key",
  "deepseek-invalid-url": "DeepSeek 地址无效，仅支持 https 或本机 http",
  "deepseek-state-error": "DeepSeek 配置状态异常",
  "deepseek-auth-error": "DeepSeek API Key 无效或已过期",
  "deepseek-http-error": "DeepSeek 服务返回错误",
  "deepseek-response-error": "DeepSeek 返回数据异常",
  "deepseek-network-error": "无法连接 DeepSeek 服务",
  "deepseek-balance-missing": "DeepSeek 未返回余额信息",
  unknown: "读取额度失败",
};

const KNOWN_CODES = new Set<QuotaErrorCode>(Object.keys(USER_MESSAGES) as QuotaErrorCode[]);

export function normalizeQuotaError(error: unknown): QuotaReadError {
  const rawCode = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "unknown";
  const code = KNOWN_CODES.has(rawCode as QuotaErrorCode)
    ? rawCode as QuotaErrorCode
    : "unknown";

  return {
    code,
    userMessage: USER_MESSAGES[code],
  };
}

export function isSemanticQuotaError(error: QuotaReadError): boolean {
  return error.code === "weekly-window-missing"
    || error.code === "weekly-window-ambiguous"
    || error.code === "five-hour-window-ambiguous"
    || error.code === "quota-data-invalid"
    || error.code === "deepseek-not-configured"
    || error.code === "deepseek-api-key-missing"
    || error.code === "deepseek-invalid-url"
    || error.code === "deepseek-state-error"
    || error.code === "deepseek-auth-error"
    || error.code === "deepseek-response-error"
    || error.code === "deepseek-balance-missing";
}

export function getUnavailableLabel(error: QuotaReadError): string {
  if (error.code === "weekly-window-missing") return "未找到七天额度";
  if (
    error.code === "weekly-window-ambiguous"
    || error.code === "five-hour-window-ambiguous"
    || error.code === "quota-data-invalid"
  ) {
    return "额度数据异常";
  }
  if (error.code === "deepseek-not-configured") return "请先配置 DeepSeek";
  if (error.code === "deepseek-api-key-missing") return "请先填写 API Key";
  if (error.code === "deepseek-invalid-url" || error.code === "deepseek-state-error") return "DeepSeek 配置无效";
  if (error.code === "deepseek-auth-error") return "DeepSeek 认证失败";
  if (error.code === "deepseek-network-error") return "无法连接 DeepSeek";
  if (error.code === "deepseek-http-error"
    || error.code === "deepseek-response-error"
    || error.code === "deepseek-balance-missing"
  ) {
    return "DeepSeek 获取失败";
  }
  return "额度读取失败";
}
