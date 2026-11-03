// 讀寫 chrome.storage.sync、預設值、驗證（SPEC §6）

import { dedupeDomains, normalizeDomain } from "./domain.js";

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 1440;

/** 網域處理方式：重新整理分頁，或在背景送出請求維持登入 */
export const MODE_RELOAD = "reload";
export const MODE_PING = "ping";

// v1.0 的欄位不可改名或移除；新欄位一律要有「缺少時等同 v1.0 行為」的預設值，
// 讓舊版資料不需轉換即可直接使用。
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  domains: [],
  tabIdleMinutes: 10,
  refreshIntervalMinutes: 20,
  useSystemIdle: true,
  // v1.1：{ [domain]: "ping" }，只記錄非預設（背景請求）的網域；未列出者為重新整理
  domainModes: {},
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

  // 只保留清單中仍存在、且值合法的網域模式
  const domainModes = {};
  if (raw.domainModes && typeof raw.domainModes === "object" && !Array.isArray(raw.domainModes)) {
    for (const [key, mode] of Object.entries(raw.domainModes)) {
      const result = normalizeDomain(key);
      if (mode === MODE_PING && result.ok && domains.includes(result.domain)) {
        domainModes[result.domain] = MODE_PING;
      }
    }
  }

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_SETTINGS.enabled,
    domains,
    tabIdleMinutes: parseMinutes(raw.tabIdleMinutes) ?? DEFAULT_SETTINGS.tabIdleMinutes,
    refreshIntervalMinutes:
      parseMinutes(raw.refreshIntervalMinutes) ?? DEFAULT_SETTINGS.refreshIntervalMinutes,
    useSystemIdle:
      typeof raw.useSystemIdle === "boolean" ? raw.useSystemIdle : DEFAULT_SETTINGS.useSystemIdle,
    domainModes,
  };
}

/**
 * @param {{ domainModes: Record<string, string> }} settings
 * @param {string} domain
 * @returns {"reload" | "ping"}
 */
export function getDomainMode(settings, domain) {
  return settings.domainModes[domain] === MODE_PING ? MODE_PING : MODE_RELOAD;
}

/**
 * 回傳設定某網域模式後的 domainModes（不修改原物件）。
 * @param {Record<string, string>} domainModes
 * @param {string} domain
 * @param {"reload" | "ping"} mode
 */
export function withDomainMode(domainModes, domain, mode) {
  const next = { ...domainModes };
  if (mode === MODE_PING) next[domain] = MODE_PING;
  else delete next[domain];
  return next;
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
