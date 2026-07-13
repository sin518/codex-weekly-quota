export type UpdateStrategy = "automatic" | "manual";

const STORAGE_KEY = "codex-weekly-quota.update-strategy";

export function getUpdateStrategy(): UpdateStrategy {
  return localStorage.getItem(STORAGE_KEY) === "manual" ? "manual" : "automatic";
}

export function setUpdateStrategy(strategy: UpdateStrategy): void {
  localStorage.setItem(STORAGE_KEY, strategy);
}
