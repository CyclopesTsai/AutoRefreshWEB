// 網域正規化、match pattern 產生、URL 比對（SPEC §7）

const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * 將使用者輸入正規化為純主機名稱。
 * 接受 `example.com`、`https://www.example.com/path`、`*.example.com`、`localhost:3000` 等。
 * @param {string} input
 * @returns {{ ok: true, domain: string } | { ok: false, error: string }}
 */
export function normalizeDomain(input) {
  if (typeof input !== "string") return { ok: false, error: "請輸入網域" };
  let s = input.trim();
  if (s === "") return { ok: false, error: "請輸入網域" };
  if (/\s/.test(s)) return { ok: false, error: "網域不可包含空白" };

  // 去掉協定
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  // 去掉前綴 *.
  s = s.replace(/^\*\./, "");
  if (s.includes("*")) return { ok: false, error: "僅支援開頭的 *. 萬用字元" };

  let hostname;
  try {
    hostname = new URL(`http://${s}`).hostname;
  } catch {
    return { ok: false, error: "無法辨識的網域格式" };
  }

  hostname = hostname.toLowerCase().replace(/\.$/, "");
  // 移除 www. 前綴，讓 www.example.com 與 example.com 視為同一網域
  if (hostname.startsWith("www.") && hostname.split(".").length > 2) {
    hostname = hostname.slice(4);
  }

  if (!isValidHostname(hostname)) {
    return { ok: false, error: "不是合法的主機名稱" };
  }
  return { ok: true, domain: hostname };
}

/**
 * @param {string} hostname 已小寫的主機名稱
 */
export function isValidHostname(hostname) {
  if (!hostname || hostname.length > 253) return false;
  const labels = hostname.split(".");
  if (!labels.every((label) => LABEL_RE.test(label))) return false;
  // 最上層網域不可全為數字（IPv4 除外）
  const tld = labels[labels.length - 1];
  if (/^\d+$/.test(tld) && !isIPv4(hostname)) return false;
  return true;
}

function isIPv4(hostname) {
  const parts = hostname.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/**
 * 主機名稱等於該網域，或是它的子網域。
 * @param {string} hostname
 * @param {string} domain 已正規化的網域
 */
export function hostMatchesDomain(hostname, domain) {
  const h = String(hostname).toLowerCase().replace(/\.$/, "");
  return h === domain || h.endsWith(`.${domain}`);
}

/**
 * @param {string} domain 已正規化的網域
 * @returns {string[]}
 */
export function domainToPatterns(domain) {
  return [`*://${domain}/*`, `*://*.${domain}/*`];
}

/**
 * 取出 match pattern 的主機部分（去掉 `*.`）；無法辨識時回傳 null。
 * @param {string} pattern 例如 `*://*.example.com/*`
 */
export function patternHost(pattern) {
  const m = /^[^:]+:\/\/(?:\*\.)?([^/:]+)(?::\d+)?\//.exec(pattern);
  return m && m[1] !== "*" ? m[1].toLowerCase() : null;
}

/**
 * 刪除網域時應撤銷的權限：已授權且屬於該網域（含子網域），但剩餘網域都不涵蓋的 pattern。
 * @param {string} removed 被刪除的網域
 * @param {string[]} remaining 剩餘網域
 * @param {string[]} grantedOrigins chrome.permissions.getAll() 的 origins
 */
export function originsToRevoke(removed, remaining, grantedOrigins) {
  const candidates = new Set([...domainToPatterns(removed), ...grantedOrigins]);
  return [...candidates].filter((pattern) => {
    const host = patternHost(pattern);
    return (
      host !== null &&
      hostMatchesDomain(host, removed) &&
      !remaining.some((d) => hostMatchesDomain(host, d))
    );
  });
}

/**
 * @param {string[]} domains
 * @returns {string[]}
 */
export function domainsToPatterns(domains) {
  return domains.flatMap(domainToPatterns);
}

/**
 * 回傳 URL 符合的網域；協定不是 http/https 或不符合任何網域時回傳 null。
 * @param {string | undefined} url
 * @param {string[]} domains
 * @returns {string | null}
 */
export function matchUrl(url, domains) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return domains.find((d) => hostMatchesDomain(parsed.hostname, d)) ?? null;
}

/**
 * 去重並維持原順序。
 * @param {string[]} domains
 */
export function dedupeDomains(domains) {
  return [...new Set(domains)];
}
