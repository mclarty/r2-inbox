import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { rawHeaders, authVerdict, parseAuthResults, matchDrop, compileDropList, orgDomain, _resetDropListCache, DROPLIST_KEY, configure } from "../src/index.js";
const CFG = { NOTIFY_RETRY_DELAYS_MS: "0,0", SELF_DOMAINS: "example.com", NEVER_DROP: "partner.example.org" };
configure(CFG);

const CF = (ar) => `Received: from x by mx.cloudflare.net\r\nARC-Seal: i=1; d=cloudflare-email.net\r\nARC-Authentication-Results: i=1; ${ar}\r\nReceived-SPF: x\r\nAuthentication-Results: ${ar}\r\n`;
const msg = (ar, from, extra = "") => new TextEncoder().encode(`${ar === null ? "" : CF(ar)}${extra}From: ${from}\r\nTo: you@example.com\r\nSubject: hi\r\nMessage-ID: <t@x>\r\n\r\nbody\r\n`).buffer;
const v = (ar, from, extra) => authVerdict(rawHeaders(msg(ar, from, extra)));

test("orgDomain", () => {
  assert.equal(orgDomain("cf-bounce.example.com"), "example.com");
  assert.equal(orgDomain("me.example.com"), "example.com");
  assert.equal(orgDomain("a.b.co.uk"), "b.co.uk");
});
test("third-party DMARC pass, not self", () => {
  const r = v("mx.cloudflare.net; dkim=pass header.d=x.com header.s=k header.b=Z; dmarc=pass header.from=x.com policy.dmarc=reject; spf=none (no SPF) smtp.helo=a.x.com; spf=pass (mx: ok) smtp.mailfrom=b@bounce.x.com; arc=none", "X <info@x.com>");
  assert.deepEqual([r.auth_verdict, r.dkim_domain, r.spf_result, r.dmarc_result, r.self_spoof_suspect], ["pass", "x.com", "pass", "pass", false]);
});
test("Cloudflare Email Sending style: aligned DKIM d=example.com -> pass", () => {
  const r = v("mx.cloudflare.net; dkim=pass header.d=example.com header.s=cf2024-1; dmarc=none header.from=example.com; spf=pass smtp.mailfrom=bounce@cf-bounce.example.com", "Your Name <you@example.com>");
  assert.equal(r.auth_verdict, "pass"); assert.equal(r.self_spoof_suspect, false);
});
test("aligned SPF only (relaxed) -> pass", () => {
  const r = v("mx.cloudflare.net; dkim=none; dmarc=none header.from=example.com; spf=pass smtp.mailfrom=b@cf-bounce.example.com", "you@example.com");
  assert.equal(r.auth_verdict, "pass");
});
test("spoof: attacker DKIM/SPF pass for own domain, From you@example.com -> fail + suspect", () => {
  const r = v("mx.cloudflare.net; dkim=pass header.d=evil.com header.s=s; dmarc=none header.from=example.com; spf=pass smtp.mailfrom=a@evil.com", "Your Name <you@example.com>");
  assert.equal(r.auth_verdict, "fail"); assert.equal(r.dkim_domain, "evil.com"); assert.equal(r.self_spoof_suspect, true);
});
test("spoof: subdomain me.example.com also flagged", () => {
  const r = v("mx.cloudflare.net; dkim=pass header.d=evil.com; dmarc=none header.from=me.example.com; spf=softfail smtp.mailfrom=a@me.example.com", "x@me.example.com");
  assert.equal(r.auth_verdict, "fail"); assert.equal(r.self_spoof_suspect, true);
});
test("forged Authentication-Results below Cloudflare's is ignored", () => {
  const r = v("mx.cloudflare.net; dkim=pass header.d=evil.com; dmarc=none header.from=example.com; spf=pass smtp.mailfrom=a@evil.com", "you@example.com",
    "Authentication-Results: mx.cloudflare.net; dkim=pass header.d=example.com; dmarc=pass header.from=example.com\r\n");
  assert.equal(r.auth_verdict, "fail"); assert.equal(r.self_spoof_suspect, true);
});
test("forged AR at top with wrong authserv / missing CF AR -> none + suspect", () => {
  const r = v(null, "you@example.com", "Authentication-Results: evil.example; dkim=pass header.d=example.com\r\n");
  assert.equal(r.auth_verdict, "none"); assert.equal(r.self_spoof_suspect, true);
});
test("comment text cannot inject results", () => {
  const r = v("mx.cloudflare.net; dkim=pass header.d=evil.com (; dkim=pass header.d=example.com); dmarc=none header.from=example.com", "you@example.com");
  assert.equal(r.auth_verdict, "fail");
});
test("two From headers -> fail", () => {
  const r = v("mx.cloudflare.net; dkim=pass header.d=example.com; dmarc=pass header.from=example.com", "you@example.com", "From: other@evil.com\r\n");
  assert.equal(r.auth_verdict, "fail"); assert.equal(r.self_spoof_suspect, true);
});
const L = compileDropList({ never_drop: [], drop: { senders: [], domains: [], subjects: [{ pattern: "autopay reminder" }] } });
test("self never-drop only when authenticated", () => {
  assert.equal(matchDrop(L, "you@example.com", "autopay reminder", "b@x.com", true), null);
  assert.equal(matchDrop(L, "you@example.com", "autopay reminder", "b@x.com", false), "subject:autopay reminder");
  assert.equal(matchDrop(L, "a@evil.com", "autopay reminder", "you@example.com", true), "subject:autopay reminder");
  assert.equal(matchDrop(L, "n@partner.example.org", "autopay reminder"), null);
});
test("worker: spoofed self mail is stored, delivered, flagged; payload small", async () => {
  _resetDropListCache();
  const puts = [], posts = [];
  globalThis.fetch = async (u, o) => { posts.push(JSON.parse(o.body)); return new Response("ok"); };
  const raw = msg("mx.cloudflare.net; dkim=pass header.d=evil.com; dmarc=none header.from=example.com; spf=pass smtp.mailfrom=a@evil.com", "Your Name <you@example.com>");
  const hdr = new Map([["from", "Your Name <you@example.com>"], ["subject", "hi"], ["message-id", "<t@x>"]]);
  const m = { from: "a@evil.com", to: "you@example.com", headers: { get: (k) => hdr.get(k.toLowerCase()) ?? null }, raw: new Blob([raw]).stream() };
  const env = { ...CFG, NOTIFY_URL: "https://hook", INBOUND: { async put(k, v, o) { puts.push([k, o]); }, async get() { return null; } } };
  await worker.email(m, env, {});
  assert.equal(puts.length, 1); assert.match(puts[0][1].customMetadata.auth, /^fail .*SPOOF$/);
  assert.equal(posts.length, 1);
  assert.deepEqual(Object.keys(posts[0]), ["key","from","subject","date","messageId","auth_verdict","dkim_domain","spf_result","dmarc_result","self_spoof_suspect"]);
  assert.equal(posts[0].auth_verdict, "fail"); assert.equal(posts[0].self_spoof_suspect, true);
});
