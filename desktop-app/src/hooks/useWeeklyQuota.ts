import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { codexQuotaProvider } from "../providers/codexQuotaProvider";
import { mockQuotaProvider } from "../providers/mockQuotaProvider";
import { isSemanticQuotaError, normalizeQuotaError } from "../providers/quotaErrors";
import type { QuotaReadError, WeeklyQuota } from "../providers/types";

const AUTO_REFRESH_MS = 5 * 60_000;
const RETRY_DELAYS_MS = [30_000, 60_000, 5 * 60_000] as const;

interface WeeklyQuotaController {
  quota: WeeklyQuota | null;
  error: QuotaReadError | null;
  refreshing: boolean;
  manualRefresh: () => Promise<void>;
}

export function useWeeklyQuota(): WeeklyQuotaController {
  const [quota, setQuota] = useState<WeeklyQuota | null>(null);
  const [error, setError] = useState<QuotaReadError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [visible, setVisible] = useState(true);
  const [retryDelay, setRetryDelay] = useState<number | null>(null);
  const mounted = useRef(true);
  const quotaRef = useRef<WeeklyQuota | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const retryIndex = useRef(0);
  const previousVisibility = useRef(true);
  const handledReset = useRef<number | null>(null);

  const refresh = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;

    setRefreshing(true);
    const request = (async () => {
      try {
        const provider = window.__TAURI_INTERNALS__ ? codexQuotaProvider : mockQuotaProvider;
        const nextQuota = await provider.getWeeklyQuota();
        quotaRef.current = nextQuota;
        retryIndex.current = 0;
        if (mounted.current) {
          setQuota(nextQuota);
          setError(null);
          setRetryDelay(null);
        }
      } catch (rawError) {
        console.error("读取 Codex 七天额度失败", rawError);
        const nextError = normalizeQuotaError(rawError);
        if (mounted.current) {
          setError(nextError);
          if (isSemanticQuotaError(nextError)) {
            retryIndex.current = 0;
            setRetryDelay(null);
          } else {
            const delay = RETRY_DELAYS_MS[Math.min(retryIndex.current, RETRY_DELAYS_MS.length - 1)];
            retryIndex.current = Math.min(retryIndex.current + 1, RETRY_DELAYS_MS.length - 1);
            setRetryDelay(delay);
          }
        }
      } finally {
        inFlight.current = null;
        if (mounted.current) setRefreshing(false);
      }
    })();

    inFlight.current = request;
    return request;
  }, []);

  const manualRefresh = useCallback(async () => {
    setRetryDelay(null);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) {
      const updateBrowserVisibility = () => setVisible(!document.hidden);
      updateBrowserVisibility();
      document.addEventListener("visibilitychange", updateBrowserVisibility);
      return () => document.removeEventListener("visibilitychange", updateBrowserVisibility);
    }

    let active = true;
    let unlisten: (() => void) | undefined;
    void getCurrentWebviewWindow().isVisible().then((isVisible) => {
      if (active) setVisible(isVisible);
    });
    void listen<boolean>("overlay-visibility-changed", (event) => {
      if (active) setVisible(event.payload);
    }).then((stopListening) => {
      if (active) unlisten = stopListening;
      else stopListening();
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (visible && !previousVisibility.current) {
      setRetryDelay(null);
      void refresh();
    }
    previousVisibility.current = visible;
  }, [refresh, visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(() => void refresh(), AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh, visible]);

  useEffect(() => {
    if (!visible || retryDelay === null) return;
    const timer = window.setTimeout(() => {
      setRetryDelay(null);
      void refresh();
    }, retryDelay);
    return () => window.clearTimeout(timer);
  }, [refresh, retryDelay, visible]);

  useEffect(() => {
    const resetsAt = quota?.resetsAt;
    if (!visible || resetsAt === null || resetsAt === undefined) return;

    const triggerBoundaryRefresh = async () => {
      if (handledReset.current === resetsAt) return;
      handledReset.current = resetsAt;
      const joinedExistingRequest = inFlight.current !== null;
      await refresh();

      const latestReset = quotaRef.current?.resetsAt;
      if (
        joinedExistingRequest
        && latestReset !== null
        && latestReset !== undefined
        && latestReset * 1000 <= Date.now()
      ) {
        await refresh();
      }
    };

    const delay = resetsAt * 1000 - Date.now();
    if (delay <= 0) {
      void triggerBoundaryRefresh();
      return;
    }

    handledReset.current = null;
    const timer = window.setTimeout(() => void triggerBoundaryRefresh(), delay);
    return () => window.clearTimeout(timer);
  }, [quota, refresh, visible]);

  return { quota, error, refreshing, manualRefresh };
}
