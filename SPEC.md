# Idle Tab Refresher — Chrome 擴充功能規格

## 1. 目的

某些網站閒置太久會自動登出。本擴充功能讓使用者指定一個或多個網域；當屬於這些網域的分頁「沒在使用」超過設定時間時，自動重新整理（reload）該分頁，以維持登入狀態。

## 2. 範圍

### 要做（In scope）
1. 使用者可設定一個或多個網域（設定頁）。
2. 背景定期檢查：符合網域的分頁若被判定為「閒置」，依設定的間隔自動 `reload`。
3. 可一鍵啟用／停用。

### 不做（Out of scope，v1）
- 不注入 content script、不偵測分頁內滑鼠鍵盤事件。
- 不偵測表單是否有未儲存內容（README 需提醒使用者此風險）。
- 不做 keep-alive fetch / API ping。
- 不上傳任何資料，不連外部伺服器，不使用遠端程式碼。

## 3. 技術限制

- Chrome Extension **Manifest V3**，純 JavaScript（ES modules），不使用打包工具、不用框架。
- `minimum_chrome_version`: `"121"`（`tab.lastAccessed` 需要）。
- Background 使用 **service worker**，不可依賴全域變數保存狀態（service worker 會被回收），狀態一律放 `chrome.storage`。
- 權限最小化，網域權限用 **optional_host_permissions** 在使用者新增網域時才動態申請，不要使用常駐的 `<all_urls>`。

## 4. 檔案結構

```
idle-tab-refresher/
├── manifest.json
├── background.js        # service worker：alarm、判斷閒置、reload
├── options.html         # 設定頁
├── options.js
├── options.css
├── lib/
│   ├── settings.js      # 讀寫 chrome.storage.sync、預設值、驗證
│   └── domain.js        # 網域正規化、match pattern 產生、URL 比對
├── icons/               # 16 / 32 / 48 / 128 png（先用簡單佔位圖）
└── README.md            # 安裝（載入未封裝項目）、使用說明、風險提醒
```

## 5. manifest.json 要點

```json
{
  "manifest_version": 3,
  "name": "Idle Tab Refresher",
  "version": "1.0.0",
  "description": "Automatically reload tabs of chosen domains when they are idle, to keep sessions alive.",
  "minimum_chrome_version": "121",
  "permissions": ["alarms", "idle", "storage"],
  "optional_host_permissions": ["*://*/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "options_ui": { "page": "options.html", "open_in_tab": true },
  "action": { "default_title": "Idle Tab Refresher" },
  "icons": { "16": "icons/16.png", "32": "icons/32.png", "48": "icons/48.png", "128": "icons/128.png" }
}
```

說明：
- 不需要 `tabs` 權限；取得使用者已授權網域的分頁 URL 靠 host permission 即可。
- 點擊工具列圖示直接開啟設定頁（`chrome.runtime.openOptionsPage()`）。

## 6. 設定資料（chrome.storage.sync）

| 欄位 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 總開關 |
| `domains` | string[] | `[]` | 使用者輸入的網域，已正規化（見 §7） |
| `tabIdleMinutes` | number | `10` | 分頁多久沒被使用，視為閒置（範圍 1–1440） |
| `refreshIntervalMinutes` | number | `20` | 分頁進入閒置後，每隔多久 reload 一次（範圍 1–1440） |
| `useSystemIdle` | boolean | `true` | 整台電腦閒置／鎖定時，也視為該分頁閒置 |

暫存狀態（`chrome.storage.session`）：
- `lastRefreshAt`: `{ [tabId: string]: number }` — 每個分頁上次由本擴充功能 reload 的時間戳（ms）。分頁關閉時清除對應項目。

## 7. 網域處理

- 使用者可輸入：`example.com`、`https://www.example.com/path`、`*.example.com`、含 port 的 `localhost:3000`。一律正規化為**純主機名稱**（小寫、去掉協定、路徑、port、前綴 `*.`），例如 `example.com`。
- 比對規則：主機名稱 **等於** 該網域，或是它的 **子網域**（`a.b.example.com` 符合 `example.com`）。不可誤比對 `notexample.com`。
- 產生 match patterns：每個網域對應 `*://example.com/*` 與 `*://*.example.com/*`。
- 只處理 `http` / `https` 分頁，忽略 `chrome://`、`file://` 等。
- 驗證：空字串、含空白、明顯非法的主機名稱要在 UI 顯示錯誤並拒絕；重複項目自動去重。

## 8. 設定頁行為（options.html）

1. **總開關**（checkbox）。
2. **網域清單**：輸入框 + 「新增」按鈕；清單每列有「刪除」按鈕。
   - 新增時呼叫 `chrome.permissions.request({ origins: [該網域的兩個 pattern] })`（必須在使用者點擊事件中呼叫）。
   - 使用者拒絕授權 → 不加入清單，顯示提示。
   - 刪除時 `chrome.permissions.remove` 移除該網域的權限並從清單移除。
3. **數字設定**：`tabIdleMinutes`、`refreshIntervalMinutes`（number input，含範圍驗證），`useSystemIdle`（checkbox）。
4. 變更即時儲存（或按「儲存」按鈕，擇一即可，保持簡單）。儲存後 background 要能讀到新設定（`chrome.storage.onChanged`）。
5. 頁面下方顯示**簡短風險提醒**：「自動重新整理會讓分頁內未儲存的輸入消失，請勿用於正在填寫表單的頁面。」
6. 介面文字：**繁體中文**為主。

## 9. 核心邏輯（background.js）

### 9.1 排程
- `chrome.runtime.onInstalled` 與 `chrome.runtime.onStartup`：建立 alarm `tick`，`periodInMinutes: 1`（若已存在則不重複建立）。
- 設定變更時：重新套用 `chrome.idle.setDetectionInterval(Math.max(15, tabIdleMinutes * 60))`。service worker 每次喚醒也要確保有設定到。
- `chrome.alarms.onAlarm`（name = `tick`）→ 執行 §9.2。
- `chrome.tabs.onRemoved`：清除該 tabId 的 `lastRefreshAt`。

### 9.2 每次 tick 的流程
```
settings = 讀取設定
若 !settings.enabled 或 domains 為空 → 結束
now = Date.now()

systemIdle = false
若 settings.useSystemIdle：
    state = await chrome.idle.queryState(tabIdleMinutes * 60)
    systemIdle = (state === "idle" || state === "locked")

tabs = await chrome.tabs.query({ url: 由 domains 產生的 match patterns })
focusedWindow = await chrome.windows.getLastFocused()

for tab of tabs:
    若 URL 協定不是 http/https → 跳過
    若 tab.hostname 不符合 domains（二次驗證，用 §7 規則）→ 跳過

    isForegroundInFocusedWindow = tab.active && tab.windowId === focusedWindow.id && focusedWindow.focused
    tabIdleByAccess = (now - tab.lastAccessed) >= tabIdleMinutes * 60_000 && !isForegroundInFocusedWindow
    isIdle = tabIdleByAccess || systemIdle
    若 !isIdle → 跳過

    last = lastRefreshAt[tab.id] ?? 0
    若 (now - last) < refreshIntervalMinutes * 60_000 → 跳過

    await chrome.tabs.reload(tab.id)
    lastRefreshAt[tab.id] = now
寫回 lastRefreshAt
```

### 9.3 規則補充
- 「分頁閒置」= **（該分頁不是目前聚焦視窗的前景分頁，且最後被切換到的時間已超過 `tabIdleMinutes`）** 或 **（整機閒置／鎖定且 `useSystemIdle` 開啟）**。
- 使用者正在使用的前景分頁（聚焦視窗 + active）在整機有輸入的情況下絕不 reload。
- 同一分頁在 `refreshIntervalMinutes` 內最多 reload 一次。
- 若分頁正在播放聲音（`tab.audible === true`），**不要** reload。
- 單一分頁 reload 失敗（例如分頁已被關閉）要 `try/catch` 吞掉，不可影響其他分頁。
- 不得在使用者「從閒置回到使用」的瞬間立刻 reload 他正在看的分頁：回到前景分頁時，`isForegroundInFocusedWindow` 為 true 且整機非 idle，天然會被跳過。

## 10. 驗收條件（Acceptance Criteria）

1. 載入未封裝項目後，工具列圖示可開啟設定頁。
2. 新增 `example.com` 時，跳出權限授權；授權後出現在清單；拒絕則不加入。
3. 輸入 `https://www.Example.com/a?b=1` 會被正規化為 `example.com`；重複新增不會出現兩筆；輸入非法內容會顯示錯誤。
4. 開啟 `https://example.com` 與 `https://sub.example.com` 兩個分頁，切到別的分頁並等待超過 `tabIdleMinutes` 後，兩者都會被 reload；`https://notexample.com` 不會。
5. 兩次 reload 之間的間隔不小於 `refreshIntervalMinutes`。
6. 正停留在該網域分頁並持續操作電腦時，不會被 reload。
7. 螢幕鎖定或整機閒置超過 `tabIdleMinutes` 時（`useSystemIdle` 開啟），即使該分頁是前景分頁也會被 reload；關閉 `useSystemIdle` 後則不會。
8. 分頁正在播放聲音時不被 reload。
9. 總開關關閉後完全不 reload；移除網域後該網域分頁不再被 reload，且權限被撤銷。
10. 關閉再開啟 Chrome 後，設定仍在，alarm 仍會運作（service worker 被回收後也能正常運作）。
11. 無任何 console error；未使用 `eval`、遠端程式碼或外部請求。

## 11. 測試建議

- 測試時可暫時把 `tabIdleMinutes`、`refreshIntervalMinutes` 設為 1。
- 在 `chrome://extensions` 點「Service Worker」開啟 DevTools，用 `console.log` 輸出每次 tick 的判斷結果（每個符合分頁的 isIdle、距離上次 reload 時間），方便驗證；正式版以 `DEBUG` 常數控制輸出。
- 建議為 `lib/domain.js`（正規化、比對）寫簡單的單元測試（可用 Node 內建 `node --test`），特別覆蓋 `notexample.com` 這類誤比對案例。

## 12. README 需包含

- 安裝方式：`chrome://extensions` → 開啟開發人員模式 → 載入未封裝項目 → 選資料夾。
- 使用方式與各設定的意義。
- 已知限制：重新整理會清掉未儲存輸入；若網站有「絕對逾時」（例如登入後固定幾小時一定登出），reload 無法延長；Chrome 重新啟動時可能提示停用開發人員模式的擴充功能。
- 隱私聲明：不收集、不傳送任何資料。

## 13. 未來可選（v2，先不做）

- Content script 偵測分頁內的實際操作時間，判斷更精準。
- 偵測頁面表單有未送出內容時略過 reload。
- 改用定時 `fetch` keep-alive 取代整頁 reload。
- 每個網域各自的閒置／間隔設定。
