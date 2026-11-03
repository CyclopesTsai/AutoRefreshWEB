import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  getDomainMode,
  getSettings,
  MODE_PING,
  MODE_RELOAD,
  sanitizeSettings,
  saveSettings,
  withDomainMode,
} from "../idle-tab-refresher/lib/settings.js";
import { describePingStatus } from "../idle-tab-refresher/lib/ping-status.js";

// v1.0.0 實際寫入 chrome.storage.sync 的資料格式（已上架版本）
const V1_STORED = Object.freeze({
  enabled: false,
  domains: ["example.com", "portal.example.org", "localhost"],
  tabIdleMinutes: 5,
  refreshIntervalMinutes: 15,
  useSystemIdle: false,
});

let store;
beforeEach(() => {
  store = structuredClone(V1_STORED);
  globalThis.chrome = {
    storage: {
      sync: {
        async get(keys) {
          return Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, structuredClone(store[k])]));
        },
        async set(obj) {
          Object.assign(store, structuredClone(obj));
        },
      },
    },
  };
});

test("v1.0 data reads back unchanged, every domain defaults to reload", async () => {
  const s = await getSettings();
  for (const [key, value] of Object.entries(V1_STORED)) {
    assert.deepEqual(s[key], value, `field ${key} must be preserved`);
  }
  assert.deepEqual(s.domainModes, {});
  for (const d of V1_STORED.domains) assert.equal(getDomainMode(s, d), MODE_RELOAD);
});

test("saving a mode keeps all v1.0 fields intact", async () => {
  const before = await getSettings();
  await saveSettings({ domainModes: withDomainMode(before.domainModes, "portal.example.org", MODE_PING) });
  for (const [key, value] of Object.entries(V1_STORED)) {
    assert.deepEqual(store[key], value, `field ${key} must be preserved in storage`);
  }
  assert.deepEqual(store.domainModes, { "portal.example.org": MODE_PING });

  const after = await getSettings();
  assert.equal(getDomainMode(after, "portal.example.org"), MODE_PING);
  assert.equal(getDomainMode(after, "example.com"), MODE_RELOAD);
});

test("saving other settings does not drop existing modes", async () => {
  store.domainModes = { "example.com": MODE_PING };
  await saveSettings({ tabIdleMinutes: 30 });
  assert.deepEqual(store.domainModes, { "example.com": MODE_PING });
  assert.deepEqual(store.domains, V1_STORED.domains);
});

test("removing a domain also removes its mode", async () => {
  store.domainModes = { "example.com": MODE_PING, "localhost": MODE_PING };
  await saveSettings({ domains: ["portal.example.org", "localhost"] });
  assert.deepEqual(store.domainModes, { localhost: MODE_PING });
});

test("sanitizeSettings: invalid or stale domainModes are ignored", () => {
  const s = sanitizeSettings({
    domains: ["example.com", "b.com"],
    domainModes: {
      "example.com": MODE_PING,
      "b.com": "reload",
      "gone.com": MODE_PING,
      "B.COM": "weird",
    },
  });
  assert.deepEqual(s.domainModes, { "example.com": MODE_PING });
  assert.deepEqual(sanitizeSettings({ domains: ["a.com"], domainModes: ["a.com"] }).domainModes, {});
  assert.deepEqual(sanitizeSettings({ domains: ["a.com"], domainModes: null }).domainModes, {});
});

test("withDomainMode does not mutate and stores only ping entries", () => {
  const original = { "a.com": MODE_PING };
  assert.deepEqual(withDomainMode(original, "b.com", MODE_PING), { "a.com": MODE_PING, "b.com": MODE_PING });
  assert.deepEqual(withDomainMode(original, "a.com", MODE_RELOAD), {});
  assert.deepEqual(original, { "a.com": MODE_PING });
});

test("describePingStatus", () => {
  const t = () => "14:32";
  assert.equal(describePingStatus(undefined, t).kind, "");
  assert.deepEqual(describePingStatus({ at: 1, status: 200, redirected: false }, t), {
    text: "上次背景請求 14:32：HTTP 200",
    kind: "ok",
  });
  assert.equal(describePingStatus({ at: 1, status: 200, redirected: true }, t).kind, "warn");
  assert.equal(describePingStatus({ at: 1, status: 401 }, t).kind, "error");
  assert.equal(describePingStatus({ at: 1, error: "timeout" }, t).text, "上次背景請求 14:32：逾時");
  assert.equal(describePingStatus({ at: 1, error: "network" }, t).kind, "error");
});
