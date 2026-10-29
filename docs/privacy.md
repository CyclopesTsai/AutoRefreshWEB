# Idle Tab Refresher 隱私權政策

生效日期：2026 年 10 月 29 日

Idle Tab Refresher（以下稱「本擴充功能」）重視你的隱私。本擴充功能**不收集、不儲存於外部、不傳送、不出售任何使用者資料**。

## 本擴充功能處理哪些資料

本擴充功能只在你的電腦上（本機）處理下列資訊，用來判斷是否要重新整理分頁。這些資訊不會離開你的裝置，也不會傳送給開發者或任何第三方。

| 資訊 | 用途 | 儲存位置 |
|---|---|---|
| 你在設定頁輸入的網域清單、時間設定、開關狀態 | 決定要處理哪些分頁、多久重新整理一次 | `chrome.storage.sync`：由 Chrome 透過你自己的 Google 帳號同步，開發者無法存取 |
| 符合你指定網域的分頁網址 | 在本機比對該分頁是否屬於你指定的網域 | 不儲存 |
| 分頁最後被切換使用的時間 | 在本機判斷分頁是否閒置 | 不儲存 |
| 電腦目前是「使用中」、「閒置」或「鎖定」 | 在本機判斷整台電腦是否閒置 | 不儲存 |
| 每個分頁上次由本擴充功能重新整理的時間 | 避免同一分頁太頻繁重新整理 | `chrome.storage.session`：只存在記憶體中，關閉瀏覽器即清除 |

本擴充功能**不會**：

- 讀取網頁內容，或在網頁中注入任何腳本
- 記錄你的瀏覽紀錄、點擊、滑鼠或鍵盤操作
- 連線到任何外部伺服器，或使用任何數據分析、廣告、錯誤回報服務
- 載入或執行任何遠端程式碼

## 權限說明

- **`alarms`**：每分鐘執行一次檢查，找出閒置的分頁。
- **`idle`**：偵測電腦是否閒置或螢幕已鎖定（可在設定中關閉此功能）。
- **`storage`**：儲存你的設定與分頁的重新整理時間。
- **網站存取權限**：只會在你新增網域時，才向你申請該網域的存取權限；刪除網域時會一併撤銷。本擴充功能只用這項權限讀取該網域分頁的網址並重新整理分頁，無法存取你未授權的網站。

## 資料分享

本擴充功能不收集任何使用者資料，因此不會與任何第三方分享、出售或轉讓使用者資料。

## 政策變更

若本政策有任何變更，會更新於此頁面並修改上方的生效日期。若日後的版本需要收集任何資料，會在發布前更新本政策，並在 Chrome 線上應用程式商店的隱私權揭露中如實說明。

## 聯絡方式

如對本政策有任何疑問，請至 GitHub 提出 issue：
<https://github.com/CyclopesTsai/AutoRefreshWEB/issues>

---

# Privacy Policy (English)

Effective date: October 29, 2026

Idle Tab Refresher ("the extension") **does not collect, transmit, sell, or share any user data.**

## What the extension processes

All of the following is processed locally on your device only, and is never sent to the developer or any third party:

- **Your settings** (domain list, time intervals, on/off switches): stored in `chrome.storage.sync`, which Chrome syncs through your own Google account. The developer has no access to it.
- **URLs of tabs that match the domains you added**: compared locally to decide whether a tab belongs to one of your domains. Not stored.
- **The time each tab was last activated**: used locally to decide whether the tab is idle. Not stored.
- **Whether your computer is active, idle, or locked**: used locally to decide whether the computer is idle. Not stored.
- **The time each tab was last reloaded by the extension**: stored in `chrome.storage.session` (in memory only, cleared when the browser closes) to avoid reloading a tab too often.

The extension does **not** read page content, inject scripts into web pages, record your browsing history or input activity, connect to any external server, use any analytics/advertising/crash-reporting service, or load remote code.

## Permissions

- **`alarms`**: runs a check once per minute to find idle tabs.
- **`idle`**: detects whether the computer is idle or locked (can be turned off in settings).
- **`storage`**: stores your settings and per-tab reload timestamps.
- **Host permissions**: requested at runtime only for the domains you explicitly add, and revoked when you remove them. They are used solely to read the URLs of those tabs and reload them.

## Changes

Any changes to this policy will be posted on this page with an updated effective date.

## Contact

Please open an issue at <https://github.com/CyclopesTsai/AutoRefreshWEB/issues>.
