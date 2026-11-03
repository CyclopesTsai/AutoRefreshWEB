// 背景請求結果：background 寫入 chrome.storage.session，設定頁讀取顯示

/** { [domain]: PingStatus } */
export const PING_STATUS_KEY = "pingStatus";

/**
 * @typedef {{ at: number, status?: number, redirected?: boolean, error?: "timeout" | "network" }} PingStatus
 */

/**
 * @param {PingStatus | undefined} s
 * @param {(ms: number) => string} formatTime
 * @returns {{ text: string, kind: "" | "ok" | "warn" | "error" }}
 */
export function describePingStatus(s, formatTime = defaultFormatTime) {
  if (!s || typeof s.at !== "number") {
    return { text: "尚未送出背景請求（分頁閒置後才會送出）", kind: "" };
  }
  const prefix = `上次背景請求 ${formatTime(s.at)}：`;
  if (s.error === "timeout") return { text: `${prefix}逾時`, kind: "error" };
  if (s.error) return { text: `${prefix}連線失敗`, kind: "error" };
  if (s.status >= 400) {
    return { text: `${prefix}HTTP ${s.status}，可能已登出或無法存取`, kind: "error" };
  }
  if (s.redirected) {
    return { text: `${prefix}HTTP ${s.status}，被重新導向（若導向登入頁，代表已登出）`, kind: "warn" };
  }
  return { text: `${prefix}HTTP ${s.status}`, kind: "ok" };
}

function defaultFormatTime(ms) {
  return new Date(ms).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}
