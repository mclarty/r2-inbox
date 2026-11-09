import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findUnsubscribe, dropNoUnsubscribe, compileDropList, configure,
  maybeNotifyUnsubscribe, queuedKeyForSender, _resetDropListCache,
  unsubscribeNotifyEnabled,
} from "../src/index.js";

configure({
  SELF_DOMAINS: "example.com",
  NEVER_DROP: "",
  ACCEPT_RECIPIENTS: "you@example.com",
});

function eml({ from = "Promo <promo@news.example>", subject = "Sale", extraHeaders = "", body = "Hello" } = {}) {
  return [
    `From: ${from}`,
    "To: you@example.com",
    `Subject: ${subject}`,
    "Date: Sun, 08 Nov 2026 22:00:00 -0500",
    "Message-ID: <unsub-test@example.com>",
    "MIME-Version: 1.0",
    "Authentication-Results: mx.cloudflare.net;",
    "\tdkim=pass header.d=news.example header.s=s1;",
    "\tdmarc=pass header.from=news.example;",
    "\tspf=pass smtp.mailfrom=promo@news.example",
    extraHeaders,
    "Content-Type: text/html; charset=utf-8",
    "",
    body,
  ].filter((x) => x !== "").join("\r\n");
}

test("findUnsubscribe reads one-click List-Unsubscribe", () => {
  const raw = eml({
    extraHeaders: [
      "List-Unsubscribe: <https://news.example/u/abc>, <mailto:leave@news.example>",
      "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    ].join("\r\n"),
    body: "<html><a href=\"https://news.example/prefs\">Manage preferences</a></html>",
  });
  const u = findUnsubscribe(new TextEncoder().encode(raw).buffer);
  assert.equal(u.found, true);
  assert.equal(u.one_click, true);
  assert.deepEqual(u.https_urls, ["https://news.example/u/abc"]);
  assert.ok(u.mailto_urls[0].startsWith("mailto:"));
  assert.ok(u.body_unsubscribe_urls.some((x) => x.includes("prefs")));
});

test("findUnsubscribe body-only unsubscribe link", () => {
  const raw = eml({ body: 'Click <a href="https://news.example/unsubscribe?x=1">Unsubscribe</a> here' });
  const u = findUnsubscribe(new TextEncoder().encode(raw).buffer);
  assert.equal(u.found, true);
  assert.equal(u.one_click, false);
  assert.deepEqual(u.body_unsubscribe_urls, ["https://news.example/unsubscribe?x=1"]);
});

test("dropNoUnsubscribe honors sender and domain flags", () => {
  const list = compileDropList({
    drop: {
      senders: [{ address: "a@x.com", no_unsubscribe: true }, { address: "b@x.com" }],
      domains: [{ domain: "blocked.example", no_unsubscribe: true }, { domain: "ok.example" }],
      subjects: [],
    },
  });
  assert.equal(dropNoUnsubscribe(list, "sender:a@x.com", "a@x.com"), true);
  assert.equal(dropNoUnsubscribe(list, "sender:b@x.com", "b@x.com"), false);
  assert.equal(dropNoUnsubscribe(list, "domain:blocked.example", "z@blocked.example"), true);
  assert.equal(dropNoUnsubscribe(list, "domain:ok.example", "z@ok.example"), false);
});

test("maybeNotifyUnsubscribe posts unsubscribe_request and queues sender", async () => {
  _resetDropListCache();
  const puts = [];
  const posts = [];
  globalThis.fetch = async (u, o) => { posts.push(JSON.parse(o.body)); return new Response("ok"); };
  const raw = new TextEncoder().encode(eml({
    extraHeaders: [
      "List-Unsubscribe: <https://news.example/u/1>",
      "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    ].join("\r\n"),
  })).buffer;
  const list = compileDropList({
    drop: { senders: [{ address: "promo@news.example" }], domains: [], subjects: [] },
  });
  const env = {
    NOTIFY_URL: "https://hook.example/notify",
    NOTIFY_AUTH: "Bearer test",
    UNSUBSCRIBE_ON_DROP: "true",
    INBOUND: {
      async get(k) {
        if (k.startsWith("config/unsubscribe-queued/")) return null;
        if (k === "config/unsubscribed.json") return { text: async () => JSON.stringify({ keys: {}, senders: {} }) };
        return null;
      },
      async put(k, v) { puts.push([k, typeof v === "string" ? v : new TextDecoder().decode(v)]); },
    },
  };
  const auth = { auth_verdict: "pass", dkim_domain: "news.example", spf_result: "pass", dmarc_result: "pass", self_spoof_suspect: false };
  const out = await maybeNotifyUnsubscribe(env, {
    key: "inbound/2026/11/08/test.eml",
    raw,
    meta: { from: "Promo <promo@news.example>", subject: "Sale", date: "x", messageId: "<m>" },
    auth,
    rule: "sender:promo@news.example",
    list,
    fromHeader: "Promo <promo@news.example>",
  });
  assert.equal(out.notified, true);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].type, "unsubscribe_request");
  assert.equal(posts[0].r2_key, "inbound/2026/11/08/test.eml");
  assert.equal(posts[0].one_click, true);
  assert.ok(posts[0].list_unsubscribe.includes("https://news.example/u/1"));
  assert.ok(puts.some(([k]) => k === queuedKeyForSender("promo@news.example")));
});

test("maybeNotifyUnsubscribe skips auth failures and no_unsubscribe", async () => {
  let n = 0; globalThis.fetch = async () => { n++; return new Response("ok"); };
  const raw = new TextEncoder().encode(eml({
    extraHeaders: "List-Unsubscribe: <https://news.example/u/1>",
  })).buffer;
  const list = compileDropList({
    drop: { senders: [{ address: "promo@news.example", no_unsubscribe: true }], domains: [], subjects: [] },
  });
  const env = { NOTIFY_URL: "https://hook", UNSUBSCRIBE_ON_DROP: "true", INBOUND: { async get() { return null; }, async put() {} } };
  const base = {
    key: "inbound/x.eml", raw,
    meta: { from: "promo@news.example", subject: "S", date: "d", messageId: "m" },
    rule: "sender:promo@news.example", list, fromHeader: "promo@news.example",
  };
  assert.equal((await maybeNotifyUnsubscribe(env, { ...base, auth: { auth_verdict: "fail", self_spoof_suspect: false } })).skipped, "auth");
  assert.equal((await maybeNotifyUnsubscribe(env, { ...base, auth: { auth_verdict: "pass", self_spoof_suspect: true } })).skipped, "auth");
  assert.equal((await maybeNotifyUnsubscribe(env, { ...base, auth: { auth_verdict: "pass", self_spoof_suspect: false } })).skipped, "no_unsubscribe");
  assert.equal(n, 0);
});

test("maybeNotifyUnsubscribe dedupes via unsubscribed.json", async () => {
  let n = 0; globalThis.fetch = async () => { n++; return new Response("ok"); };
  const raw = new TextEncoder().encode(eml({
    extraHeaders: "List-Unsubscribe: <https://news.example/u/1>",
  })).buffer;
  const list = compileDropList({ drop: { senders: [{ address: "promo@news.example" }], domains: [], subjects: [] } });
  const env = {
    NOTIFY_URL: "https://hook",
    UNSUBSCRIBE_ON_DROP: "true",
    INBOUND: {
      async get(k) {
        if (k === "config/unsubscribed.json") {
          return { text: async () => JSON.stringify({ keys: {}, senders: { "promo@news.example": { status: "ok" } } }) };
        }
        return null;
      },
      async put() {},
    },
  };
  const out = await maybeNotifyUnsubscribe(env, {
    key: "inbound/x.eml", raw, list, rule: "sender:promo@news.example", fromHeader: "promo@news.example",
    meta: { from: "promo@news.example", subject: "S", date: "d", messageId: "m" },
    auth: { auth_verdict: "pass", self_spoof_suspect: false },
  });
  assert.equal(out.skipped, "unsubscribed:ok");
  assert.equal(n, 0);
});

test("UNSUBSCRIBE_ON_DROP defaults off", () => {
  assert.equal(unsubscribeNotifyEnabled({}), false);
  assert.equal(unsubscribeNotifyEnabled({ UNSUBSCRIBE_ON_DROP: "true" }), true);
  assert.equal(unsubscribeNotifyEnabled({ UNSUBSCRIBE_ON_DROP: "1" }), true);
  assert.equal(unsubscribeNotifyEnabled({ UNSUBSCRIBE_ON_DROP: "false" }), false);
  assert.equal(unsubscribeNotifyEnabled({ UNSUBSCRIBE_ON_DROP: "off" }), false);
});
