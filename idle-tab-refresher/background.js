// Service worker：alarm、判斷閒置、reload（SPEC §9）
// 注意：service worker 隨時會被回收，狀態一律放 chrome.storage，不使用全域變數保存。

import { domainsToPatterns, matchUrl } from "./lib/domain.js";
import { getSettings, sanitizeSettings } from "./lib/settings.js";

const DEBUG = false;
const ALARM_NAME = "tick";
const LAST_REFRESH_KEY = "lastRefreshAt";

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
  const { [LAST_REFRESH_KEY]: map } = await chrome.storage.session.get(LAST_REFRESH_KEY);
  return map && typeof map === "object" ? map : {};
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

  // 清掉已不存在分頁的紀錄（補強 onRemoved 與 tick 之間的競態）
  const existingIds = new Set((await chrome.tabs.query({})).map((t) => String(t.id)));
  for (const id of Object.keys(lastRefreshAt)) {
    if (!existingIds.has(id)) delete lastRefreshAt[id];
  }

  log("tick", { systemIdle, tabCount: tabs.length });

  for (const tab of tabs) {
    if (tab.id === undefined || tab.id === chrome.tabs.TAB_ID_NONE) continue;
    // 協定檢查與網域二次驗證（§7）
    if (!matchUrl(tab.url, settings.domains)) continue;

    const isForegroundInFocusedWindow =
      tab.active &&
      focusedWindow !== null &&
      tab.windowId === focusedWindow.id &&
      focusedWindow.focused;
    const lastAccessed = tab.lastAccessed ?? now;
    const tabIdleByAccess = now - lastAccessed >= tabIdleMs && !isForegroundInFocusedWindow;
    const isIdle = tabIdleByAccess || systemIdle;

    const key = String(tab.id);
    const last = lastRefreshAt[key] ?? 0;
    const sinceLastRefresh = now - last;

    log(`tab ${tab.id}`, {
      url: tab.url,
      isIdle,
      tabIdleByAccess,
      isForegroundInFocusedWindow,
      audible: tab.audible,
      idleForSec: Math.round((now - lastAccessed) / 1000),
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

  await setLastRefreshAt(lastRefreshAt);
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
