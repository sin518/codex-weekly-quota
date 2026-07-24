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
  "quota-data-invalid": "Codex 返回的额度数据不完整",
  unknown: "读取 Codex 七天额度失败",
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
    || error.code === "quota-data-invalid";
}

export function getUnavailableLabel(error: QuotaReadError): string {
  if (error.code === "weekly-window-missing") return "未找到七天额度";
  if (error.code === "weekly-window-ambiguous" || error.code === "quota-data-invalid") {
    return "额度数据异常";
  }
  return "额度读取失败";
}
