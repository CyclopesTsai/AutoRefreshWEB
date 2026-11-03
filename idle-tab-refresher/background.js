// Service worker：alarm、判斷閒置、reload 或背景請求（SPEC §9）
// 注意：service worker 隨時會被回收，狀態一律放 chrome.storage，不使用全域變數保存。

import { domainsToPatterns, matchUrl } from "./lib/domain.js";
import { getDomainMode, getSettings, MODE_PING, sanitizeSettings } from "./lib/settings.js";
import { PING_STATUS_KEY } from "./lib/ping-status.js";

const DEBUG = false;
const ALARM_NAME = "tick";
const LAST_REFRESH_KEY = "lastRefreshAt";
// { [origin]: number } 每個 origin 上次送出背景請求的時間
const LAST_PING_KEY = "lastPingAt";
const PING_TIMEOUT_MS = 20_000;

function log(...args) {
  if (DEBUG) console.log("[IdleTabRefresher]", ...args);
}

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    log("alarm created");
  }
}

function applyIdleDetectionInterval(settings) {
  chrome.idle.setDetectionInterval(Math.max(15, settings.tabIdleMinutes * 60));
}

async function getLastRefreshAt() {
  return getSessionMap(LAST_REFRESH_KEY);
}

async function setLastRefreshAt(map) {
  await chrome.storage.session.set({ [LAST_REFRESH_KEY]: map });
}

async function getFocusedWindow() {
  try {
    return await chrome.windows.getLastFocused();
  } catch {
    return null; // 沒有任何視窗
  }
}

async function tick() {
  const settings = await getSettings();
  if (!settings.enabled || settings.domains.length === 0) {
    log("skip: disabled or no domains");
    return;
  }

  const now = Date.now();
  const tabIdleMs = settings.tabIdleMinutes * 60_000;
  const refreshIntervalMs = settings.refreshIntervalMinutes * 60_000;

  let systemIdle = false;
  if (settings.useSystemIdle) {
    const state = await chrome.idle.queryState(settings.tabIdleMinutes * 60);
    systemIdle = state === "idle" || state === "locked";
  }

  // 只會回傳已授權網域的分頁；未授權的網域自然查不到
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: domainsToPatterns(settings.domains) });
  } catch (err) {
    log("tabs.query failed", err);
    return;
  }
  const focusedWindow = await getFocusedWindow();

  const lastRefreshAt = await getLastRefreshAt();
  const lastPingAt = await getSessionMap(LAST_PING_KEY);
  const pingStatus = await getSessionMap(PING_STATUS_KEY);

  // 清掉已不存在分頁的紀錄（補強 onRemoved 與 tick 之間的競態）
  const existingIds = new Set((await chrome.tabs.query({})).map((t) => String(t.id)));
  for (const id of Object.keys(lastRefreshAt)) {
    if (!existingIds.has(id)) delete lastRefreshAt[id];
  }

  log("tick", { systemIdle, tabCount: tabs.length });

  // 背景請求：同一個 origin 每次 tick 最多一次，所有請求最後並行送出
  /** @type {Map<string, { url: string, domain: string }>} */
  const pings = new Map();
  const openOrigins = new Set();

  for (const tab of tabs) {
    if (tab.id === undefined || tab.id === chrome.tabs.TAB_ID_NONE) continue;
    // 協定檢查與網域二次驗證（§7）
    const domain = matchUrl(tab.url, settings.domains);
    if (!domain) continue;

    if (getDomainMode(settings, domain) === MODE_PING) {
      const origin = new URL(tab.url).origin;
      openOrigins.add(origin);
      if (pings.has(origin) || !isTabIdle(tab, now, tabIdleMs, systemIdle, focusedWindow)) continue;
      if (now - (lastPingAt[origin] ?? 0) < refreshIntervalMs) continue;
      pings.set(origin, { url: tab.url, domain });
      continue;
    }

    const isIdle = isTabIdle(tab, now, tabIdleMs, systemIdle, focusedWindow);

    const key = String(tab.id);
    const last = lastRefreshAt[key] ?? 0;
    const sinceLastRefresh = now - last;

    log(`tab ${tab.id}`, {
      url: tab.url,
      isIdle,
      audible: tab.audible,
      idleForSec: Math.round((now - (tab.lastAccessed ?? now)) / 1000),
      sinceLastRefreshSec: last ? Math.round(sinceLastRefresh / 1000) : null,
    });

    if (!isIdle) continue;
    if (tab.audible) continue;
    if (sinceLastRefresh < refreshIntervalMs) continue;

    try {
      await chrome.tabs.reload(tab.id);
      lastRefreshAt[key] = now;
      log(`reloaded tab ${tab.id}`);
    } catch (err) {
      // 例如分頁剛好被關閉；不影響其他分頁
      log(`reload failed for tab ${tab.id}`, err);
    }
  }

  await Promise.all(
    [...pings].map(async ([origin, { url, domain }]) => {
      lastPingAt[origin] = now;
      pingStatus[domain] = await ping(url, now);
      log(`pinged ${origin}`, pingStatus[domain]);
    }),
  );

  // 只保留仍開著的 origin 與仍在清單中的網域
  for (const origin of Object.keys(lastPingAt)) {
    if (!openOrigins.has(origin)) delete lastPingAt[origin];
  }
  for (const domain of Object.keys(pingStatus)) {
    if (getDomainMode(settings, domain) !== MODE_PING) delete pingStatus[domain];
  }

  await setLastRefreshAt(lastRefreshAt);
  await chrome.storage.session.set({ [LAST_PING_KEY]: lastPingAt, [PING_STATUS_KEY]: pingStatus });
}

/**
 * 分頁閒置 =（不是聚焦視窗的前景分頁，且超過 tabIdleMinutes 沒被切換到）或 整機閒置／鎖定（§9.3）
 */
function isTabIdle(tab, now, tabIdleMs, systemIdle, focusedWindow) {
  const isForegroundInFocusedWindow =
    tab.active &&
    focusedWindow !== null &&
    tab.windowId === focusedWindow.id &&
    focusedWindow.focused;
  const lastAccessed = tab.lastAccessed ?? now;
  const tabIdleByAccess = now - lastAccessed >= tabIdleMs && !isForegroundInFocusedWindow;
  return tabIdleByAccess || systemIdle;
}

/**
 * 以分頁目前的網址在背景送出 GET（帶 cookie），讓伺服器延長 session。
 * 不讀取回應內容，只記錄狀態碼與是否被重新導向（可能代表已登出）。
 * @returns {Promise<import("./lib/ping-status.js").PingStatus>}
 */
async function ping(url, now) {
  try {
    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    res.body?.cancel().catch(() => {});
    return { at: now, status: res.status, redirected: res.redirected };
  } catch (err) {
    return { at: now, error: err?.name === "TimeoutError" ? "timeout" : "network" };
  }
}

async function getSessionMap(key) {
  const { [key]: map } = await chrome.storage.session.get(key);
  return map && typeof map === "object" ? map : {};
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    tick().catch((err) => log("tick failed", err));
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const map = await getLastRefreshAt();
  const key = String(tabId);
  if (key in map) {
    delete map[key];
    await setLastRefreshAt(map);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes.tabIdleMinutes) return;
  applyIdleDetectionInterval(sanitizeSettings({ tabIdleMinutes: changes.tabIdleMinutes.newValue }));
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// service worker 每次喚醒都確保 alarm 與 idle 偵測間隔已設定
ensureAlarm().catch((err) => log("ensureAlarm failed", err));
getSettings()
  .then(applyIdleDetectionInterval)
  .catch((err) => log("apply idle interval failed", err));
