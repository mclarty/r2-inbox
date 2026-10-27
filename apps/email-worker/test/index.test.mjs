import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, { buildKey, configure } from "../src/index.js";
const CFG = { NOTIFY_RETRY_DELAYS_MS: "0,0", SELF_DOMAINS: "example.com", NEVER_DROP: "partner.example.org", ACCEPT_RECIPIENTS: "you@example.com,you+*@example.com,*@me.example.com" };
configure(CFG);

const raw = readFileSync(new URL("./sample.eml", import.meta.url));
function mkMsg() {
  const hdr = new Map([["from","Example News <news@example.com>"],["to","you@example.com"],["subject","Weekly digest"],["date","Tue, 13 Oct 2026 15:00:00 -0400"],["message-id","<abc123@example.com>"]]);
  return { from: "bounce@example.com", to: "you@example.com", headers: { get: (k) => hdr.get(k.toLowerCase()) ?? null },
    raw: new Blob([raw]).stream(), forwarded: null, async forward(a) { this.forwarded = a; } };
}
const ctx = { p: [], waitUntil(p) { this.p.push(p); } };

test("key format", async () => {
  const k = await buildKey("<abc123@example.com>", new Date("2026-10-13T19:45:00.123Z"));
  assert.match(k, /^inbound\/2026\/10\/13\/20261013T194500123Z-[0-9a-f]{16}\.eml$/);
});
test("stores and notifies via webhook, no forward", async () => {
  const puts = [], posts = [];
  globalThis.fetch = async (u, o) => { posts.push([u, JSON.parse(o.body), o.headers]); return new Response("ok"); };
  const env = { ...CFG, NOTIFY_URL: "https://hook", NOTIFY_AUTH: "Bearer k", INBOUND: { async put(k, v, o) { puts.push([k, v, o]); }, async get() { return null; } } };
  const m = mkMsg(); await worker.email(m, env, ctx);
  assert.equal(puts.length, 1); assert.equal(Buffer.from(puts[0][1]).toString(), raw.toString());
  assert.equal(puts[0][2].customMetadata.subject, "Weekly digest");
  assert.deepEqual(Object.keys(posts[0][1]), ["key","from","subject","date","messageId","auth_verdict","dkim_domain","spf_result","dmarc_result","self_spoof_suspect"]);
  assert.equal(posts[0][2].authorization, "Bearer k");
  assert.ok(!m.forwarded);
});
test("webhook failure logs failed/ and does not forward", async () => {
  const puts = [];
  globalThis.fetch = async () => new Response("no", { status: 500 });
  const env = { ...CFG, NOTIFY_URL: "https://hook", INBOUND: { async put(k, v) { puts.push([k, v]); }, async get() { return null; } } };
  const m = mkMsg(); await worker.email(m, env, ctx);
  assert.ok(!m.forwarded);
  const f = puts.find(([k]) => k.startsWith("failed/")); assert.ok(f);
  assert.equal(JSON.parse(f[1]).reason, "notify_status");
});
test("R2 failure throws and never calls webhook", async () => {
  let called = false; globalThis.fetch = async () => { called = true; return new Response("ok"); };
  const m = mkMsg();
  await assert.rejects(worker.email(m, { ...CFG, NOTIFY_URL: "https://hook", INBOUND: { async put() { throw new Error("boom"); }, async get() { return null; } } }, ctx));
  assert.equal(called, false); assert.ok(!m.forwarded);
});

// ---- drop list ----
import { compileDropList, matchDrop, extractAddress, loadDropList, _resetDropListCache, DROPLIST_KEY, DROPLIST_TTL_MS } from "../src/index.js";
const DOC = {
  never_drop: [],
  allow: { senders: ["messages-noreply@social.example"], domains: ["shop.example", "planes.example"] },
  drop: {
    senders: [{ address: "ads-noreply@ads.example" }],
    domains: [{ domain: "social.example", subdomains: true }, { domain: "hello.us.shop.example", subdomains: true }, { domain: "content.planes.example" }],
    subjects: [{ pattern: "^Shipper Values Your Feedback$", flags: "i" }, { pattern: "(?i)autopay reminder" }],
  },
};
const L = compileDropList(DOC);
function mkMsg2(from, subject, env = "bounce@x.com") {
  const hdr = new Map([["from", from], ["subject", subject], ["message-id", "<m@x>"]]);
  return { from: env, to: "you@example.com", headers: { get: (k) => hdr.get(k.toLowerCase()) ?? null },
    raw: new Blob([raw]).stream(), forwarded: null, async forward(a) { this.forwarded = a; } };
}
function mkEnv(doc, puts = []) {
  return { ...CFG, INBOUND: { async put(k, v, o) { puts.push([k, v, o]); },
    async get(k) { if (k !== DROPLIST_KEY || doc === undefined) return null; return { text: async () => typeof doc === "string" ? doc : JSON.stringify(doc) }; } } };
}

test("extractAddress", () => {
  assert.equal(extractAddress('"Ads" <Ads-NoReply@Ads.Example>'), "ads-noreply@ads.example");
  assert.equal(extractAddress("x@y.com"), "x@y.com");
  assert.equal(extractAddress(""), "");
});
test("sender exact, case-insensitive", () => {
  assert.equal(matchDrop(L, "Ads <ADS-noreply@ads.example>", "hi"), "sender:ads-noreply@ads.example");
  assert.equal(matchDrop(L, "x@ads.example", "hi"), null);
});
test("domain + subdomain, allow-sender exception", () => {
  assert.equal(matchDrop(L, "notifications-noreply@social.example", "x"), "domain:social.example");
  assert.equal(matchDrop(L, "a@e.social.example", "x"), "domain:social.example");
  assert.equal(matchDrop(L, "messages-noreply@social.example", "x"), null);
});
test("receipts domain kept, marketing subdomain dropped", () => {
  assert.equal(matchDrop(L, "orders@shop.example", "Your order"), null);
  assert.equal(matchDrop(L, "hello@hello.us.shop.example", "Promo"), "domain:hello.us.shop.example");
  assert.equal(matchDrop(L, "store@content.planes.example", "Sale"), "domain:content.planes.example");
  assert.equal(matchDrop(L, "orders@planes.example", "Invoice"), null);
});
test("subject regex, case-insensitive, any sender", () => {
  assert.match(matchDrop(L, "shipper@message.shipper.example", "shipper values your feedback"), /^subject:/);
  assert.equal(matchDrop(L, "shipper@message.shipper.example", "Your package was delivered"), null);
  assert.match(matchDrop(L, "a@isp.example", "Your AUTOPAY reminder"), /^subject:/);
});
test("never drop your own addresses", () => {
  assert.equal(matchDrop(L, "you@example.com", "autopay reminder", undefined, true), null); // only when authenticated (selfAuth)
  assert.equal(matchDrop(L, "you@example.com", "autopay reminder"), "subject:(?i)autopay reminder");
  assert.equal(matchDrop(L, "n@partner.example.org", "Shipper Values Your Feedback"), null);
  assert.equal(matchDrop(L, "ads-noreply@ads.example", "x", "you@sub.example.com"), "sender:ads-noreply@ads.example"); // self envelope no longer exempts
});
test("compile rejects malformed, skips bad regex", () => {
  assert.throws(() => compileDropList({}));
  const l = compileDropList({ drop: { subjects: [{ pattern: "(" }, { pattern: "ok" }] } });
  assert.equal(l.subjects.length, 1);
});
test("worker drops: archives, logs dropped/, no forward", async () => {
  _resetDropListCache(); const puts = [];
  const m = mkMsg2("Ads <ads-noreply@ads.example>", "Weekly");
  await worker.email(m, mkEnv(DOC, puts), ctx);
  assert.equal(m.forwarded, null);
  assert.equal(puts.length, 2);
  assert.match(puts[0][0], /^inbound\//);
  assert.match(puts[1][0], /^dropped\/\d{4}\/\d\d\/\d\d\/.+\.json$/);
  assert.equal(puts[1][2].customMetadata.dropped, "sender:ads-noreply@ads.example");
  assert.equal(JSON.parse(puts[1][1]).key, puts[0][0]);
});
test("worker notifies webhook for non-matching mail", async () => {
  _resetDropListCache(); const puts = [], posts = [];
  globalThis.fetch = async (u, o) => { posts.push(JSON.parse(o.body)); return new Response("ok"); };
  const env = mkEnv(DOC, puts); env.NOTIFY_URL = "https://hook";
  const m = mkMsg2("orders@shop.example", "Receipt"); await worker.email(m, env, ctx);
  assert.equal(posts.length, 1); assert.equal(m.forwarded, null); assert.equal(puts.length, 1);
});
test("fail open: missing / unparsable / throwing list still notifies", async () => {
  for (const env of [mkEnv(undefined), mkEnv("{not json"), mkEnv({ nope: 1 }),
    { ...CFG, INBOUND: { async put() {}, async get() { throw new Error("r2 down"); } } }]) {
    _resetDropListCache(); let n = 0;
    globalThis.fetch = async () => { n++; return new Response("ok"); };
    env.NOTIFY_URL = "https://hook";
    const m = mkMsg2("ads-noreply@ads.example", "x"); await worker.email(m, env, ctx);
    assert.equal(n, 1); assert.equal(m.forwarded, null);
  }
});
test("archive failed: throws (bounce), no drop, no webhook", async () => {
  _resetDropListCache(); let n = 0;
  globalThis.fetch = async () => { n++; return new Response("ok"); };
  const env = mkEnv(DOC); env.NOTIFY_URL = "https://hook"; env.INBOUND.put = async () => { throw new Error("boom"); };
  const m = mkMsg2("ads-noreply@ads.example", "x");
  await assert.rejects(() => worker.email(m, env, ctx), /archive failed/);
  assert.equal(n, 0); assert.equal(m.forwarded, null);
});
test("cache: one R2 read within TTL, reload after", async () => {
  _resetDropListCache(); let gets = 0;
  const env = { ...CFG, INBOUND: { async get() { gets++; return { text: async () => JSON.stringify(DOC) }; } } };
  await loadDropList(env, 1000); await loadDropList(env, 1000 + DROPLIST_TTL_MS - 1);
  assert.equal(gets, 1);
  await loadDropList(env, 1000 + DROPLIST_TTL_MS + 1); assert.equal(gets, 2);
});

test("webhook throws with archive: logs failed/, does not throw", async () => {
  _resetDropListCache(); const puts = [];
  globalThis.fetch = async () => { throw new Error("network down"); };
  const env = mkEnv(DOC, puts); env.NOTIFY_URL = "https://hook";
  const m = mkMsg2("orders@shop.example", "Receipt"); await worker.email(m, env, ctx);
  assert.equal(m.forwarded, null); assert.equal(puts.length, 2);
  assert.equal(puts[1][0], "failed/" + puts[0][0].slice("inbound/".length).replace(/\.eml$/, ".json"));
  const rec = JSON.parse(puts[1][1]);
  assert.equal(rec.reason, "notify_failed"); assert.match(rec.error, /network down/); assert.equal(rec.key, puts[0][0]);
});
test("no NOTIFY_URL: logs failed/ notify_unset", async () => {
  _resetDropListCache(); const puts = [];
  const m = mkMsg2("orders@shop.example", "Receipt"); await worker.email(m, mkEnv(DOC, puts), ctx);
  assert.equal(JSON.parse(puts[1][1]).reason, "notify_unset"); assert.equal(m.forwarded, null);
});

import { wantedRecipient } from "../src/index.js";
test("wantedRecipient", () => {
  for (const a of ["you@example.com","YOU@example.com","you+news@example.com","<you+x.y@example.com>","bob@me.example.com"]) assert.ok(wantedRecipient(a), a);
  for (const a of ["bob@example.com","youx@example.com","you@evil.example.com.net","you@me.example.com.x","", null]) assert.ok(!wantedRecipient(a), String(a));
});
test("worker drops unwanted recipient: archived, logged, no webhook", async () => {
  _resetDropListCache(); const puts = []; let n = 0;
  globalThis.fetch = async () => { n++; return new Response("ok"); };
  const env = mkEnv(DOC, puts); env.NOTIFY_URL = "https://hook";
  const m = mkMsg2("orders@shop.example", "Receipt"); m.to = "sales@example.com";
  await worker.email(m, env, ctx);
  assert.equal(n, 0); assert.equal(puts.length, 2); assert.equal(JSON.parse(puts[1][1]).dropped, "recipient");
});
test("REJECT_DROPPED=true: archives, logs, then setReject 5xx", async () => {
  _resetDropListCache(); const puts = [];
  const m = mkMsg2("Ads <ads-noreply@ads.example>", "Weekly"); m.setReject = (r) => { m.rejected = r; };
  const env = mkEnv(DOC, puts); env.REJECT_DROPPED = "true";
  await worker.email(m, env, ctx);
  assert.match(m.rejected, /^550 5\.7\.1 /);
  assert.equal(puts.length, 2); assert.match(puts[0][0], /^inbound\//);
  assert.equal(JSON.parse(puts[1][1]).rejected, m.rejected);
});
test("reject kill switch in droplist; recipient drops never rejected; normal mail not rejected", async () => {
  _resetDropListCache(); let puts = [];
  let m = mkMsg2("ads-noreply@ads.example", "W"); m.setReject = (r) => { m.rejected = r; };
  let env = mkEnv({ ...DOC, reject_dropped: false }, puts); env.REJECT_DROPPED = "true";
  await worker.email(m, env, ctx); assert.equal(m.rejected, undefined); assert.equal(puts.length, 2);
  _resetDropListCache(); puts = [];
  m = mkMsg2("ads-noreply@ads.example", "W"); m.to = "bob@example.com"; m.setReject = (r) => { m.rejected = r; };
  env = mkEnv(DOC, puts); env.REJECT_DROPPED = "true";
  await worker.email(m, env, ctx); assert.equal(m.rejected, undefined);
  _resetDropListCache(); puts = [];
  globalThis.fetch = async () => new Response("ok");
  m = mkMsg2("orders@shop.example", "Receipt"); m.setReject = (r) => { m.rejected = r; };
  env = mkEnv(DOC, puts); env.REJECT_DROPPED = "true"; env.NOTIFY_URL = "https://hook";
  await worker.email(m, env, ctx); assert.equal(m.rejected, undefined);
});

test("configure: empty ACCEPT_RECIPIENTS accepts every recipient", () => {
  configure({});
  assert.ok(wantedRecipient("anyone@anything.example"));
  assert.ok(!wantedRecipient("not-an-address"));
  configure(CFG);
});
test("configure: glob patterns are anchored and escaped", () => {
  configure({ ACCEPT_RECIPIENTS: "a.b@example.com" });
  assert.ok(wantedRecipient("a.b@example.com"));
  assert.ok(!wantedRecipient("axb@example.com"));
  configure(CFG);
});
import { retryDelays, DEFAULT_RETRY_DELAYS_MS } from "../src/index.js";
test("retryDelays: default, override, invalid values ignored", () => {
  assert.deepEqual(retryDelays({}), DEFAULT_RETRY_DELAYS_MS);
  assert.deepEqual(retryDelays({ NOTIFY_RETRY_DELAYS_MS: "0, 1000,x,-5,999999" }), [0, 1000]);
  assert.deepEqual(retryDelays({ NOTIFY_RETRY_DELAYS_MS: "nope" }), DEFAULT_RETRY_DELAYS_MS);
});
