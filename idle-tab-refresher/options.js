// 設定頁（SPEC §8）

import { domainToPatterns, normalizeDomain, originsToRevoke } from "./lib/domain.js";
import { describePingStatus, PING_STATUS_KEY } from "./lib/ping-status.js";
import {
  getDomainMode,
  getSettings,
  MAX_MINUTES,
  MIN_MINUTES,
  MODE_PING,
  MODE_RELOAD,
  parseMinutes,
  saveSettings,
  withDomainMode,
} from "./lib/settings.js";

const MODE_LABELS = [
  [MODE_RELOAD, "重新整理頁面"],
  [MODE_PING, "背景保持連線（不清除輸入）"],
];

const $ = (id) => document.getElementById(id);

const els = {
  enabled: $("enabled"),
  addForm: $("add-form"),
  domainInput: $("domain-input"),
  domainMessage: $("domain-message"),
  domainList: $("domain-list"),
  domainEmpty: $("domain-empty"),
  tabIdleMinutes: $("tabIdleMinutes"),
  refreshIntervalMinutes: $("refreshIntervalMinutes"),
  useSystemIdle: $("useSystemIdle"),
  saveStatus: $("save-status"),
};

// 頁面上的設定快照；新增網域時需同步判斷重複，才能讓 permissions.request 留在使用者手勢內
let current = null;
let saveStatusTimer = 0;

function showMessage(el, text, kind = "") {
  el.textContent = text;
  el.className = `message${kind ? ` ${kind}` : ""}`;
}

function flashSaved() {
  showMessage(els.saveStatus, "已儲存", "ok");
  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => showMessage(els.saveStatus, ""), 1500);
}

function setFieldError(input, text) {
  const errorEl = document.querySelector(`[data-error-for="${input.id}"]`);
  errorEl.textContent = text;
  input.setAttribute("aria-invalid", text ? "true" : "false");
}

async function hasPermission(domain) {
  try {
    return await chrome.permissions.contains({ origins: domainToPatterns(domain) });
  } catch {
    return false;
  }
}

async function requestPermission(domain) {
  try {
    return await chrome.permissions.request({ origins: domainToPatterns(domain) });
  } catch {
    return false;
  }
}

async function getPingStatuses() {
  try {
    const { [PING_STATUS_KEY]: map } = await chrome.storage.session.get(PING_STATUS_KEY);
    return map && typeof map === "object" ? map : {};
  } catch {
    return {};
  }
}

function createButton(text, className, focusKey, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  if (className) button.className = className;
  button.dataset.focusKey = focusKey;
  button.addEventListener("click", onClick);
  return button;
}

function createModeGroup(domain, index) {
  const group = document.createElement("div");
  group.className = "modes";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", `${domain} 的處理方式`);

  const selected = getDomainMode(current, domain);
  for (const [mode, text] of MODE_LABELS) {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `mode-${index}`;
    radio.value = mode;
    radio.checked = mode === selected;
    radio.dataset.focusKey = `mode:${domain}:${mode}`;
    radio.addEventListener("change", () => onModeChange(domain, mode));
    label.append(radio, text);
    group.append(label);
  }
  return group;
}

async function renderDomains() {
  if (!current) return;
  const domains = current.domains;
  const [granted, pingStatuses] = await Promise.all([
    Promise.all(domains.map(hasPermission)),
    getPingStatuses(),
  ]);

  // 重新繪製後把焦點放回原本的控制項（例如用方向鍵切換選項時）
  const focusKey = document.activeElement?.dataset?.focusKey;

  els.domainList.replaceChildren(
    ...domains.map((domain, i) => {
      const li = document.createElement("li");

      const main = document.createElement("div");
      main.className = "row-main";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = domain;
      main.append(name);

      if (!granted[i]) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "未授權";
        main.append(badge, createButton("重新授權", "", `grant:${domain}`, () => onRegrant(domain)));
      }

      const remove = createButton("刪除", "danger", `remove:${domain}`, () => onRemove(domain));
      remove.setAttribute("aria-label", `刪除 ${domain}`);
      main.append(remove);
      li.append(main, createModeGroup(domain, i));

      if (getDomainMode(current, domain) === MODE_PING) {
        const { text, kind } = describePingStatus(pingStatuses[domain]);
        const status = document.createElement("p");
        status.className = `ping-status${kind ? ` ${kind}` : ""}`;
        status.textContent = text;
        li.append(status);
      }

      return li;
    }),
  );
  els.domainEmpty.hidden = domains.length > 0;

  if (focusKey) {
    [...els.domainList.querySelectorAll("[data-focus-key]")]
      .find((el) => el.dataset.focusKey === focusKey)
      ?.focus();
  }
}

function renderFields() {
  els.enabled.checked = current.enabled;
  els.useSystemIdle.checked = current.useSystemIdle;
  for (const input of [els.tabIdleMinutes, els.refreshIntervalMinutes]) {
    // 不覆蓋使用者正在編輯的欄位
    if (document.activeElement !== input) {
      input.value = String(current[input.id]);
      setFieldError(input, "");
    }
  }
}

async function refresh() {
  current = await getSettings();
  renderFields();
  await renderDomains();
}

async function onAdd(event) {
  event.preventDefault();
  const result = normalizeDomain(els.domainInput.value);
  if (!result.ok) {
    showMessage(els.domainMessage, result.error, "error");
    return;
  }
  const { domain } = result;
  if (current.domains.includes(domain)) {
    showMessage(els.domainMessage, `${domain} 已在清單中`, "error");
    els.domainInput.value = "";
    return;
  }

  // 必須是此事件處理中的第一個 await，才會被視為使用者手勢
  const granted = await requestPermission(domain);
  if (!granted) {
    showMessage(els.domainMessage, `未取得 ${domain} 的存取權限，因此沒有加入清單`, "error");
    return;
  }

  const latest = await getSettings();
  current = await saveSettings({ domains: [...latest.domains, domain] });
  els.domainInput.value = "";
  showMessage(els.domainMessage, `已新增 ${domain}`, "ok");
  await renderDomains();
}

async function onRegrant(domain) {
  const granted = await requestPermission(domain);
  showMessage(
    els.domainMessage,
    granted ? `已重新授權 ${domain}` : `未取得 ${domain} 的存取權限`,
    granted ? "ok" : "error",
  );
  await renderDomains();
}

async function onRemove(domain) {
  const latest = await getSettings();
  const remaining = latest.domains.filter((d) => d !== domain);
  current = await saveSettings({ domains: remaining });

  // 撤銷此網域（含先前刪除時因被涵蓋而保留的子網域）的權限，
  // 但仍被剩餘網域涵蓋的不撤銷（例如刪除 sub.example.com 但保留 example.com）
  try {
    const { origins = [] } = await chrome.permissions.getAll();
    const toRevoke = originsToRevoke(domain, remaining, origins);
    if (toRevoke.length > 0) await chrome.permissions.remove({ origins: toRevoke });
  } catch {
    // 權限可能已被使用者在 chrome://extensions 移除
  }

  showMessage(els.domainMessage, `已刪除 ${domain}`, "ok");
  // 撤銷權限可能連帶影響其他網域（權限重疊），重新顯示授權狀態
  await renderDomains();
}

async function onModeChange(domain, mode) {
  const latest = await getSettings();
  current = await saveSettings({ domainModes: withDomainMode(latest.domainModes, domain, mode) });
  showMessage(
    els.domainMessage,
    mode === MODE_PING ? `${domain} 改為背景保持連線` : `${domain} 改為重新整理頁面`,
    "ok",
  );
  await renderDomains();
}

async function onToggle(event) {
  const input = event.currentTarget;
  current = await saveSettings({ [input.id]: input.checked });
  flashSaved();
}

async function onMinutesChange(event) {
  const input = event.currentTarget;
  const value = parseMinutes(input.value);
  if (value === null) {
    setFieldError(input, `請輸入 ${MIN_MINUTES}–${MAX_MINUTES} 之間的整數`);
    return;
  }
  setFieldError(input, "");
  current = await saveSettings({ [input.id]: value });
  flashSaved();
}

els.addForm.addEventListener("submit", onAdd);
els.enabled.addEventListener("change", onToggle);
els.useSystemIdle.addEventListener("change", onToggle);
els.tabIdleMinutes.addEventListener("change", onMinutesChange);
els.refreshIntervalMinutes.addEventListener("change", onMinutesChange);
els.domainInput.addEventListener("input", () => showMessage(els.domainMessage, ""));

// 其他設定頁或 chrome://extensions 的變更也同步顯示
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync") refresh();
  else if (areaName === "session" && changes[PING_STATUS_KEY]) renderDomains();
});
chrome.permissions.onAdded.addListener(() => renderDomains());
chrome.permissions.onRemoved.addListener(() => renderDomains());

refresh();
