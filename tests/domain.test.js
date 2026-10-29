import { test } from "node:test";
import assert from "node:assert/strict";

import {
  dedupeDomains,
  domainToPatterns,
  hostMatchesDomain,
  matchUrl,
  normalizeDomain,
  originsToRevoke,
  patternHost,
} from "../idle-tab-refresher/lib/domain.js";
import { parseMinutes, sanitizeSettings } from "../idle-tab-refresher/lib/settings.js";

function norm(input) {
  const r = normalizeDomain(input);
  assert.ok(r.ok, `expected ${JSON.stringify(input)} to be valid, got: ${r.error}`);
  return r.domain;
}

function rejects(input) {
  const r = normalizeDomain(input);
  assert.equal(r.ok, false, `expected ${JSON.stringify(input)} to be rejected, got ${r.domain}`);
}

test("normalizeDomain: accepted inputs", () => {
  assert.equal(norm("example.com"), "example.com");
  assert.equal(norm("https://www.Example.com/a?b=1"), "example.com");
  assert.equal(norm("https://www.example.com/path"), "example.com");
  assert.equal(norm("*.example.com"), "example.com");
  assert.equal(norm("https://*.example.com/"), "example.com");
  assert.equal(norm("localhost:3000"), "localhost");
  assert.equal(norm("http://localhost:3000/app"), "localhost");
  assert.equal(norm("  Sub.Example.COM.  "), "sub.example.com");
  assert.equal(norm("user:pw@example.com"), "example.com");
  assert.equal(norm("192.168.1.10:8080"), "192.168.1.10");
  assert.equal(norm("xn--fiq228c.tw"), "xn--fiq228c.tw");
  assert.equal(norm("中文.tw"), "xn--fiq228c.tw");
  assert.equal(norm("www.com"), "www.com");
});

test("normalizeDomain: rejected inputs", () => {
  rejects("");
  rejects("   ");
  rejects("exa mple.com");
  rejects("example .com");
  rejects("foo_bar.com");
  rejects("-example.com");
  rejects("example-.com");
  rejects("example..com");
  rejects("a.*.example.com");
  rejects("*");
  rejects("http://");
  rejects("example.123");
  rejects("[::1]");
  rejects("a".repeat(64) + ".com");
  rejects(undefined);
});

test("hostMatchesDomain: exact and subdomains", () => {
  assert.ok(hostMatchesDomain("example.com", "example.com"));
  assert.ok(hostMatchesDomain("sub.example.com", "example.com"));
  assert.ok(hostMatchesDomain("a.b.example.com", "example.com"));
  assert.ok(hostMatchesDomain("EXAMPLE.com.", "example.com"));
});

test("hostMatchesDomain: no false positives", () => {
  assert.equal(hostMatchesDomain("notexample.com", "example.com"), false);
  assert.equal(hostMatchesDomain("example.com.evil.net", "example.com"), false);
  assert.equal(hostMatchesDomain("example.co", "example.com"), false);
  assert.equal(hostMatchesDomain("com", "example.com"), false);
  assert.equal(hostMatchesDomain("example.com", "sub.example.com"), false);
});

test("domainToPatterns", () => {
  assert.deepEqual(domainToPatterns("example.com"), ["*://example.com/*", "*://*.example.com/*"]);
});

test("patternHost", () => {
  assert.equal(patternHost("*://example.com/*"), "example.com");
  assert.equal(patternHost("*://*.example.com/*"), "example.com");
  assert.equal(patternHost("https://localhost:3000/*"), "localhost");
  assert.equal(patternHost("*://*/*"), null);
});

test("originsToRevoke", () => {
  const granted = [
    ...domainToPatterns("example.com"),
    ...domainToPatterns("sub.example.com"),
    ...domainToPatterns("notexample.com"),
  ];
  // 子網域被剩餘的父網域涵蓋 → 不撤銷
  assert.deepEqual(originsToRevoke("sub.example.com", ["example.com"], granted), []);
  // 刪除父網域 → 連同殘留的子網域權限一併撤銷，但不動 notexample.com
  assert.deepEqual(
    originsToRevoke("example.com", ["notexample.com"], granted).sort(),
    [...domainToPatterns("example.com"), ...domainToPatterns("sub.example.com")].sort(),
  );
  // 刪除父網域但仍保留子網域 → 子網域權限保留
  assert.deepEqual(
    originsToRevoke("example.com", ["sub.example.com"], granted),
    domainToPatterns("example.com"),
  );
  // 權限已被手動移除時，仍嘗試撤銷該網域自己的 pattern（無副作用）
  assert.deepEqual(originsToRevoke("gone.com", [], []), domainToPatterns("gone.com"));
});

test("matchUrl: protocol and domain checks", () => {
  const domains = ["example.com", "localhost"];
  assert.equal(matchUrl("https://example.com/", domains), "example.com");
  assert.equal(matchUrl("http://sub.example.com/x", domains), "example.com");
  assert.equal(matchUrl("http://localhost:3000/", domains), "localhost");
  assert.equal(matchUrl("https://notexample.com/", domains), null);
  assert.equal(matchUrl("ftp://example.com/", domains), null);
  assert.equal(matchUrl("file:///example.com/index.html", domains), null);
  assert.equal(matchUrl("chrome://settings", domains), null);
  assert.equal(matchUrl(undefined, domains), null);
  assert.equal(matchUrl("not a url", domains), null);
});

test("dedupeDomains keeps first occurrence order", () => {
  assert.deepEqual(dedupeDomains(["a.com", "b.com", "a.com"]), ["a.com", "b.com"]);
});

test("parseMinutes range validation", () => {
  assert.equal(parseMinutes(1), 1);
  assert.equal(parseMinutes("1440"), 1440);
  assert.equal(parseMinutes(" 5 "), 5);
  assert.equal(parseMinutes(0), null);
  assert.equal(parseMinutes(1441), null);
  assert.equal(parseMinutes(1.5), null);
  assert.equal(parseMinutes(""), null);
  assert.equal(parseMinutes("abc"), null);
  assert.equal(parseMinutes(null), null);
});

test("sanitizeSettings fills defaults and normalizes domains", () => {
  assert.deepEqual(sanitizeSettings({}), {
    enabled: true,
    domains: [],
    tabIdleMinutes: 10,
    refreshIntervalMinutes: 20,
    useSystemIdle: true,
  });
  const s = sanitizeSettings({
    enabled: false,
    domains: ["https://www.Example.com/", "example.com", "bad domain"],
    tabIdleMinutes: 0,
    refreshIntervalMinutes: 30,
    useSystemIdle: "yes",
  });
  assert.deepEqual(s, {
    enabled: false,
    domains: ["example.com"],
    tabIdleMinutes: 10,
    refreshIntervalMinutes: 30,
    useSystemIdle: true,
  });
});
