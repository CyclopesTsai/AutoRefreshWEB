// 讀寫 chrome.storage.sync、預設值、驗證（SPEC §6）

import { dedupeDomains, normalizeDomain } from "./domain.js";

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 1440;

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  domains: [],
  tabIdleMinutes: 10,
  refreshIntervalMinutes: 20,
  useSystemIdle: true,
});

/**
 * 驗證分鐘數；合法回傳整數，否則回傳 null。
 * @param {unknown} value
 */
export function parseMinutes(value) {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isInteger(n)) return null;
  if (n < MIN_MINUTES || n > MAX_MINUTES) return null;
  return n;
}

/**
 * 將任意（可能損壞的）儲存資料整理為完整、合法的設定。
 * @param {Record<string, unknown>} raw
 */
export function sanitizeSettings(raw = {}) {
  const domains = Array.isArray(raw.domains)
    ? dedupeDomains(
        raw.domains
          .map((d) => normalizeDomain(d))
          .filter((r) => r.ok)
          .map((r) => r.domain),
      )
    : [...DEFAULT_SETTINGS.domains];

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_SETTINGS.enabled,
    domains,
    tabIdleMinutes: parseMinutes(raw.tabIdleMinutes) ?? DEFAULT_SETTINGS.tabIdleMinutes,
    refreshIntervalMinutes:
      parseMinutes(raw.refreshIntervalMinutes) ?? DEFAULT_SETTINGS.refreshIntervalMinutes,
    useSystemIdle:
      typeof raw.useSystemIdle === "boolean" ? raw.useSystemIdle : DEFAULT_SETTINGS.useSystemIdle,
  };
}

export async function getSettings() {
  const raw = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  return sanitizeSettings(raw);
}

/**
 * 合併部分設定後驗證並寫回。
 * @param {Partial<typeof DEFAULT_SETTINGS>} partial
 */
export async function saveSettings(partial) {
  const current = await getSettings();
  const next = sanitizeSettings({ ...current, ...partial });
  await chrome.storage.sync.set(next);
  return next;
}
