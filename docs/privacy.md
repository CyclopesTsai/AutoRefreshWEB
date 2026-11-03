# Idle Tab Refresher 隱私權政策

生效日期：2026 年 11 月 3 日

Idle Tab Refresher（以下稱「本擴充功能」）重視你的隱私。本擴充功能**不收集、不儲存於外部、不傳送、不出售任何使用者資料**。

## 本擴充功能處理哪些資料

本擴充功能只在你的電腦上（本機）處理下列資訊，用來判斷是否要重新整理分頁。這些資訊不會離開你的裝置，也不會傳送給開發者或任何第三方。

| 資訊 | 用途 | 儲存位置 |
|---|---|---|
| 你在設定頁輸入的網域清單、每個網域的處理方式、時間設定、開關狀態 | 決定要處理哪些分頁、如何處理、多久處理一次 | `chrome.storage.sync`：由 Chrome 透過你自己的 Google 帳號同步，開發者無法存取 |
| 符合你指定網域的分頁網址 | 在本機比對該分頁是否屬於你指定的網域 | 不儲存 |
| 分頁最後被切換使用的時間 | 在本機判斷分頁是否閒置 | 不儲存 |
| 電腦目前是「使用中」、「閒置」或「鎖定」 | 在本機判斷整台電腦是否閒置 | 不儲存 |
| 每個分頁上次由本擴充功能重新整理的時間、每個網站上次送出背景請求的時間 | 避免太頻繁重新整理或送出請求 | `chrome.storage.session`：只存在記憶體中，關閉瀏覽器即清除 |
| 背景請求的結果（時間、HTTP 狀態碼、是否被重新導向） | 在設定頁顯示背景保持連線是否成功 | `chrome.storage.session`：只存在記憶體中，關閉瀏覽器即清除；不記錄網址與回應內容 |

## 背景保持連線

若你將某個網域設為「背景保持連線」，本擴充功能會在該網域的分頁閒置後，定期以分頁目前的網址，從你的瀏覽器直接對該網站送出一般的 `GET` 請求，並附上瀏覽器中該網站既有的 Cookie，效果與你自己造訪該網頁相同，目的是讓網站延長你的登入狀態。

- 請求只會送到**你自己新增的網域**，不會送到開發者或任何第三方的伺服器。
- 本擴充功能不讀取、不儲存請求的回應內容，只記錄上表所列的狀態碼與是否被重新導向。
- 本擴充功能不會讀取、修改或另外傳送你的 Cookie；Cookie 由瀏覽器依一般規則附加在送往該網站的請求上。

本擴充功能**不會**：

- 讀取網頁內容，或在網頁中注入任何腳本
- 記錄你的瀏覽紀錄、點擊、滑鼠或鍵盤操作
- 連線到你未新增的網站或開發者的伺服器，或使用任何數據分析、廣告、錯誤回報服務
- 載入或執行任何遠端程式碼

## 權限說明

- **`alarms`**：每分鐘執行一次檢查，找出閒置的分頁。
- **`idle`**：偵測電腦是否閒置或螢幕已鎖定（可在設定中關閉此功能）。
- **`storage`**：儲存你的設定、分頁的重新整理時間與背景請求結果。
- **網站存取權限**：只會在你新增網域時，才向你申請該網域的存取權限；刪除網域時會一併撤銷。本擴充功能只用這項權限讀取該網域分頁的網址、重新整理分頁，以及對設為「背景保持連線」的網域送出請求，無法存取你未授權的網站。

## 資料分享

本擴充功能不收集任何使用者資料，因此不會與任何第三方分享、出售或轉讓使用者資料。

## 政策變更

若本政策有任何變更，會更新於此頁面並修改上方的生效日期。若日後的版本需要收集任何資料，會在發布前更新本政策，並在 Chrome 線上應用程式商店的隱私權揭露中如實說明。

## 聯絡方式

如對本政策有任何疑問，請至 GitHub 提出 issue：
<https://github.com/CyclopesTsai/AutoRefreshWEB/issues>

---

# Privacy Policy (English)

Effective date: November 3, 2026

Idle Tab Refresher ("the extension") **does not collect, transmit, sell, or share any user data.**

## What the extension processes

All of the following is processed locally on your device only, and is never sent to the developer or any third party:

- **Your settings** (domain list, per-domain handling mode, time intervals, on/off switches): stored in `chrome.storage.sync`, which Chrome syncs through your own Google account. The developer has no access to it.
- **URLs of tabs that match the domains you added**: compared locally to decide whether a tab belongs to one of your domains. Not stored.
- **The time each tab was last activated**: used locally to decide whether the tab is idle. Not stored.
- **Whether your computer is active, idle, or locked**: used locally to decide whether the computer is idle. Not stored.
- **The time each tab was last reloaded, and each site was last sent a keep-alive request**: stored in `chrome.storage.session` (in memory only, cleared when the browser closes) to avoid acting too often.
- **The result of the last keep-alive request** (time, HTTP status code, whether it was redirected): stored in `chrome.storage.session` and shown on the settings page. URLs and response content are not recorded.

## Background keep-alive

If you set a domain to "background keep-alive", once that domain's tabs are idle the extension periodically sends a normal `GET` request for the tab's current URL directly from your browser to that website, with the site's existing cookies attached by the browser — the same as you visiting the page — so the site extends your login session.

- Requests are sent **only to domains you added yourself**, never to the developer or any third-party server.
- The response content is not read or stored; only the status code and whether the request was redirected are recorded.
- The extension does not read, modify, or separately transmit your cookies; the browser attaches them to requests to that site under its normal rules.

The extension does **not** read page content, inject scripts into web pages, record your browsing history or input activity, connect to any website you did not add or to the developer's servers, use any analytics/advertising/crash-reporting service, or load remote code.

## Permissions

- **`alarms`**: runs a check once per minute to find idle tabs.
- **`idle`**: detects whether the computer is idle or locked (can be turned off in settings).
- **`storage`**: stores your settings, per-tab reload timestamps, and keep-alive results.
- **Host permissions**: requested at runtime only for the domains you explicitly add, and revoked when you remove them. They are used solely to read the URLs of those tabs, reload them, and send keep-alive requests to domains set to background keep-alive.

## Changes

Any changes to this policy will be posted on this page with an updated effective date.

## Contact

Please open an issue at <https://github.com/CyclopesTsai/AutoRefreshWEB/issues>.
