import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { codexQuotaProvider } from "../providers/codexQuotaProvider";
import { mockQuotaProvider } from "../providers/mockQuotaProvider";
import { deepseekQuotaProvider } from "../providers/deepseekQuotaProvider";
import { mockDeepSeekProvider } from "../providers/mockDeepSeekProvider";
import { isSemanticQuotaError, normalizeQuotaError } from "../providers/quotaErrors";
import {
  DEEPSEEK_CONFIG_CHANGED_EVENT,
  QUOTA_SOURCE_CHANGED_EVENT,
  getDeepSeekBaseUrl,
  getDeepSeekTopUp,
  getQuotaSource,
} from "../preferences/quotaSource";
import type {
  DeepSeekBalanceSnapshot,
  QuotaReadError,
  QuotaSnapshot,
  QuotaSource,
} from "../providers/types";

const AUTO_REFRESH_MS = 5 * 60_000;
const RETRY_DELAYS_MS = [30_000, 60_000, 5 * 60_000] as const;

interface QuotaController {
  source: QuotaSource;
  quota: QuotaSnapshot | null;
  balance: DeepSeekBalanceSnapshot | null;
  topUp: number;
  error: QuotaReadError | null;
  refreshing: boolean;
  manualRefresh: () => Promise<void>;
}

export function useCodexQuota(): QuotaController {
  const [source, setSource] = useState<QuotaSource>(() => getQuotaSource());
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null);
  const [balance, setBalance] = useState<DeepSeekBalanceSnapshot | null>(null);
  const [topUp, setTopUp] = useState(() => Number(getDeepSeekTopUp()) || 0);
  const [error, setError] = useState<QuotaReadError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [visible, setVisible] = useState(true);
  const [retryDelay, setRetryDelay] = useState<number | null>(null);

  const mounted = useRef(true);
  const quotaRef = useRef<QuotaSnapshot | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const inFlightSource = useRef<QuotaSource | null>(null);
  const latestRequestId = useRef(0);
  const retryIndex = useRef(0);
  const previousVisibility = useRef(true);
  const handledReset = useRef<number | null>(null);

  const refresh = useCallback((): Promise<void> => {
    if (inFlight.current && inFlightSource.current === source) return inFlight.current;
    const requestId = ++latestRequestId.current;
    const requestSource = source;
    setRefreshing(true);

    const request = (async () => {
      try {
        if (requestSource === "deepseek") {
          const baseUrl = getDeepSeekBaseUrl();
          const provider = window.__TAURI_INTERNALS__ ? deepseekQuotaProvider : mockDeepSeekProvider;
          const next = await provider.getBalance(baseUrl);
          if (latestRequestId.current !== requestId || !mounted.current) return;
          quotaRef.current = null;
          setQuota(null);
          setBalance(next);
          setTopUp(Number(getDeepSeekTopUp()) || 0);
          setError(null);
          setRetryDelay(null);
        } else {
          const provider = window.__TAURI_INTERNALS__ ? codexQuotaProvider : mockQuotaProvider;
          const next = await provider.getQuota();
          if (latestRequestId.current !== requestId || !mounted.current) return;
          quotaRef.current = next;
          setQuota(next);
          setBalance(null);
          setError(null);
          setRetryDelay(null);
        }
        retryIndex.current = 0;

      } catch (rawError) {
        if (latestRequestId.current !== requestId || !mounted.current) return;
        const nextError = normalizeQuotaError(rawError);
        setError(nextError);
        setQuota(null);
        setBalance(null);
        if (isSemanticQuotaError(nextError)) {
          retryIndex.current = 0;
          setRetryDelay(null);
        } else {
          const delay = RETRY_DELAYS_MS[Math.min(retryIndex.current, RETRY_DELAYS_MS.length - 1)];
          retryIndex.current = Math.min(retryIndex.current + 1, RETRY_DELAYS_MS.length - 1);
          setRetryDelay(delay);
        }
      } finally {
        if (latestRequestId.current === requestId) {
          inFlight.current = null;
          inFlightSource.current = null;
          setRefreshing(false);
        }
      }
    })();

    inFlight.current = request;
    inFlightSource.current = requestSource;
    return request;
  }, [source]);

  const manualRefresh = useCallback(async () => {
    setRetryDelay(null);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    latestRequestId.current += 1;
    setQuota(null);
    setBalance(null);
    setError(null);
    setRetryDelay(null);
    retryIndex.current = 0;
    void refresh();
    return () => {
      mounted.current = false;
      latestRequestId.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    const syncSource = () => {
      const next = getQuotaSource();
      setSource((previous) => (previous === next ? previous : next));
    };
    window.addEventListener("storage", syncSource);
    if (window.__TAURI_INTERNALS__) {
      let active = true;
      let stopSource: (() => void) | undefined;
      let stopConfig: (() => void) | undefined;
      void listen(QUOTA_SOURCE_CHANGED_EVENT, syncSource).then((stop) => {
        if (active) stopSource = stop;
        else stop();
      });
      void listen(DEEPSEEK_CONFIG_CHANGED_EVENT, () => {
        if (getQuotaSource() === "deepseek") void refresh();
      }).then((stop) => {
        if (active) stopConfig = stop;
        else stop();
      });
      return () => {
        active = false;
        stopSource?.();
        stopConfig?.();
        window.removeEventListener("storage", syncSource);
      };
    }
    return () => window.removeEventListener("storage", syncSource);
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
    const resetsAt = getNextResetAt(quota);
    if (!visible || resetsAt === null) return;

    const triggerBoundaryRefresh = async () => {
      if (handledReset.current === resetsAt) return;
      handledReset.current = resetsAt;
      const joinedExistingRequest = inFlight.current !== null;
      await refresh();
      const latestReset = getNextResetAt(quotaRef.current);
      if (joinedExistingRequest && latestReset !== null && latestReset * 1000 <= Date.now()) {
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

  return { source, quota, balance, topUp, error, refreshing, manualRefresh };
}

function getNextResetAt(quota: QuotaSnapshot | null): number | null {
  if (!quota) return null;
  const resetTimes = [quota.fiveHour?.resetsAt, quota.weekly.resetsAt]
    .filter((value): value is number => value !== null && value !== undefined);
  return resetTimes.length > 0 ? Math.min(...resetTimes) : null;
}
