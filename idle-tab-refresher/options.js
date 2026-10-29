// 設定頁（SPEC §8）

import { domainToPatterns, normalizeDomain, originsToRevoke } from "./lib/domain.js";
import { getSettings, MAX_MINUTES, MIN_MINUTES, parseMinutes, saveSettings } from "./lib/settings.js";

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

async function renderDomains() {
  if (!current) return;
  const domains = current.domains;
  const granted = await Promise.all(domains.map(hasPermission));

  els.domainList.replaceChildren(
    ...domains.map((domain, i) => {
      const li = document.createElement("li");

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = domain;
      li.append(name);

      if (!granted[i]) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "未授權";
        li.append(badge);

        const grant = document.createElement("button");
        grant.type = "button";
        grant.textContent = "重新授權";
        grant.addEventListener("click", () => onRegrant(domain));
        li.append(grant);
      }

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "刪除";
      remove.setAttribute("aria-label", `刪除 ${domain}`);
      remove.addEventListener("click", () => onRemove(domain));
      li.append(remove);

      return li;
    }),
  );
  els.domainEmpty.hidden = domains.length > 0;
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
chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === "sync") refresh();
});
chrome.permissions.onAdded.addListener(() => renderDomains());
chrome.permissions.onRemoved.addListener(() => renderDomains());

refresh();
