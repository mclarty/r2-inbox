import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { resetCaches } from "../src/store.js";
import {
  buildDraft,
  claimSend,
  htmlToPlain,
  isOwnIdentity,
  normalizeOutgoing,
  parseRecipient,
  parseRecipientList,
  replyRecipients,
  resetSendLedger,
  sanitizeOutgoingHtml,
  threadingFromHeaders,
  withSubjectPrefix,
} from "../src/compose.js";
import { sendMessage } from "../src/outbound.js";

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const TOKEN = "test-email-token-value";
const FROM = "you@example.com";

function settings(extra = {}) {
  return {
    from: FROM,
    fromName: "Example Inbox",
    replyTo: "you@example.com",
    ...extra,
  };
}

function providerOk(result) {
  return new Response(JSON.stringify({ success: true, errors: [], result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function configured(fetcher, extra = {}) {
  return {
    MAIL: extra.MAIL || { async list() { return { objects: [], truncated: false }; } },
    MAIL_FROM: FROM,
    MAIL_FROM_NAME: "Example Inbox",
    MAIL_REPLY_TO: "you@example.com",
    MAIL_OWN_ADDRESSES: "me@example.net",
    EMAIL_ACCOUNT_ID: ACCOUNT,
    EMAIL_API_TOKEN: TOKEN,
    EMAIL_FETCH: fetcher,
    ...extra,
  };
}

function messageBody(extra = {}) {
  return {
    to: ["ada@example.com"],
    cc: ["pat@example.com"],
    bcc: ["hidden@example.net"],
    subject: "Hello",
    html: "<p>Hello <b>there</b></p><p>Second paragraph.</p>",
    ...extra,
  };
}

async function postSend(env, body, key = "idempotency-key-0001", headers = {}) {
  const response = await worker.fetch(new Request("https://inbox.example/api/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://inbox.example",
      "sec-fetch-site": "same-origin",
      "idempotency-key": key,
      ...headers,
    },
    body: JSON.stringify(body),
  }), env);
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text), text };
}

test("recipient parser accepts named addresses and rejects injection", () => {
  assert.deepEqual(parseRecipient("Ada Lovelace <ada@example.com>"), { email: "ada@example.com", name: "Ada Lovelace" });
  assert.deepEqual(parseRecipient('"Ada" <ada@example.com>'), { email: "ada@example.com", name: "Ada" });
  assert.deepEqual(parseRecipient("ada@example.com"), { email: "ada@example.com", name: "" });
  assert.throws(() => parseRecipient("ada@example.com\r\nBcc: hidden@example.net"), /control character/);
  assert.throws(() => parseRecipient("not an address"), /not a valid email address/);
  assert.throws(() => parseRecipient("ada@example.com\u0000"), /control character/);
  assert.deepEqual(parseRecipientList("ada@example.com, Bob <bob@example.com>", "To").map((item) => item.email), [
    "ada@example.com",
    "bob@example.com",
  ]);
});

test("plain text keeps paragraphs, lists, quotes, and links from rich html", () => {
  const html = [
    "<p>Hello <b>there</b></p>",
    "<p>Second paragraph.</p>",
    "<ul><li>One</li><li>Two</li></ul>",
    "<blockquote><p>quoted line</p></blockquote>",
    '<p><a href="https://example.com/note">note</a></p>',
  ].join("");
  const plain = htmlToPlain(html);
  assert.match(plain, /Hello there/);
  assert.match(plain, /Second paragraph\./);
  assert.match(plain, /Hello there\n\nSecond paragraph\./);
  assert.match(plain, /- One/);
  assert.match(plain, /- Two/);
  assert.match(plain, /> quoted line/);
  assert.match(plain, /note \(https:\/\/example\.com\/note\)/);
  const unicode = htmlToPlain("<p>こんにちは café — “quotes”</p>");
  assert.equal(unicode, "こんにちは café — “quotes”");
});

test("outgoing html drops scripts, active urls, and remote images", () => {
  const clean = sanitizeOutgoingHtml([
    "<p>Hello</p>",
    "<script>alert(1)</script>",
    '<a href="javascript:alert(1)">click</a>',
    '<a href="https://example.com/ok">ok</a>',
    '<img src="https://tracker.example/pixel.png" alt="t">',
    '<img src="data:text/html,<script>alert(1)</script>">',
  ].join(""));
  assert.match(clean, /Hello/);
  assert.match(clean, /https:\/\/example\.com\/ok/);
  assert.doesNotMatch(clean, /script/i);
  assert.doesNotMatch(clean, /javascript:/i);
  assert.doesNotMatch(clean, /tracker\.example/);
  assert.doesNotMatch(clean, /<img/i);
  assert.doesNotMatch(clean, /onerror/i);
});

test("provider payload keeps bcc off headers and ignores a client from address", () => {
  const { payload } = normalizeOutgoing({
    ...messageBody(),
    from: "ceo@example.com",
    headers: { Bcc: "hidden@example.net", From: "ceo@example.com" },
    inReplyTo: "<letter-1@example.com>",
    references: ["<letter-0@example.com>"],
  }, settings());
  assert.deepEqual(payload.from, { address: FROM, name: "Example Inbox" });
  assert.deepEqual(payload.bcc, ["hidden@example.net"]);
  assert.equal(payload.reply_to, FROM);
  assert.equal(payload.headers["In-Reply-To"], "<letter-1@example.com>");
  assert.match(payload.headers.References, /<letter-0@example.com>/);
  assert.match(payload.headers.References, /<letter-1@example.com>/);
  const headerBlob = JSON.stringify(payload.headers);
  assert.equal(headerBlob.toLowerCase().includes("bcc"), false);
  assert.equal(headerBlob.includes("hidden@example.net"), false);
  assert.equal(payload.html.includes("hidden@example.net"), false);
  assert.equal(payload.text.includes("hidden@example.net"), false);
  assert.match(payload.text, /Hello there/);
  assert.match(payload.text, /Second paragraph/);
  assert.equal(Object.hasOwn(payload, "attachments"), false);
});

test("subject prefixes are not repeated", () => {
  assert.equal(withSubjectPrefix("Re: Re: Hello", "Re"), "Re: Hello");
  assert.equal(withSubjectPrefix("RE: Hello", "Re"), "Re: Hello");
  assert.equal(withSubjectPrefix("Fwd: Hello", "Re"), "Re: Fwd: Hello");
  assert.equal(withSubjectPrefix("Fw: Fw: Café", "Fwd"), "Fwd: Café");
  assert.equal(withSubjectPrefix("Re: Hello", "Fwd"), "Fwd: Re: Hello");
  assert.equal(withSubjectPrefix("  ", "Re"), "Re: (No subject)");
});

test("reply-all drops own addresses, duplicates, and every bcc", () => {
  const view = {
    from_name: "Ada",
    from_email: "ada@example.com",
    reply_to: [{ name: "Replies", email: "replies@example.com" }],
    to: [
      { name: "You", email: "you@example.com" },
      { name: "Bob", email: "bob@example.com" },
      { name: "Ada", email: "ada@example.com" },
      { name: "", email: "you+news@example.com" },
    ],
    cc: [
      { name: "Pat", email: "pat@example.com" },
      { name: "", email: "Bob@example.com" },
      { name: "", email: "ME@example.net" },
    ],
    bcc: [{ name: "Hidden", email: "hidden@example.net" }],
  };
  const own = ["you@example.com", "me@example.net"];
  assert.equal(isOwnIdentity("you+news@example.com", own), true);
  assert.equal(isOwnIdentity("you+news@example.com", ["you+other@example.com"]), false);
  const all = replyRecipients(view, own, true);
  assert.deepEqual(all.to.map((item) => item.email), ["replies@example.com"]);
  assert.deepEqual(all.cc.map((item) => item.email), ["bob@example.com", "ada@example.com", "pat@example.com"]);
  assert.deepEqual(all.bcc, []);
  const reply = replyRecipients(view, own, false);
  assert.deepEqual(reply.to.map((item) => item.email), ["replies@example.com"]);
  assert.deepEqual(reply.cc, []);
  const fallback = replyRecipients({ ...view, reply_to: [{ email: "not an address" }] }, own, false);
  assert.deepEqual(fallback.to.map((item) => item.email), ["ada@example.com"]);
  assert.match(fallback.warnings.join(" "), /Reply-To/);
  const blob = JSON.stringify(all) + JSON.stringify(reply);
  assert.equal(blob.includes("hidden@example.net"), false);
});

test("reply and forward drafts thread, quote safely, and never reveal bcc", () => {
  const view = {
    subject: "Re: Re: Café menu",
    from_name: "Ada",
    from_email: "ada@example.com",
    to: [{ name: "You", email: "you@example.com" }],
    cc: [{ name: "Pat", email: "pat@example.com" }],
    bcc: [{ name: "Hidden", email: "hidden@example.net" }],
    date: "Tue, 13 Oct 2026 15:04:00 -0500",
    html: "<p>See <b>the café</b></p><script>alert(1)</script><img src=\"https://tracker.example/x.png\">",
    text: null,
    headers: [
      { name: "Message-ID", value: "<letter-1@example.com>" },
      { name: "References", value: "<letter-0@example.com> <letter-1@example.com>" },
    ],
    parts: [{ inline: false, filename: "notes.pdf" }],
  };
  const reply = buildDraft(view, "reply", ["you@example.com"]);
  assert.equal(reply.subject, "Re: Café menu");
  assert.deepEqual(reply.to.map((item) => item.email), ["ada@example.com"]);
  assert.deepEqual(reply.cc, []);
  assert.deepEqual(reply.bcc, []);
  assert.equal(reply.inReplyTo, "<letter-1@example.com>");
  assert.deepEqual(reply.references, ["<letter-0@example.com>", "<letter-1@example.com>"]);
  assert.match(reply.html, /On Tue, 13 Oct 2026 15:04:00 -0500, Ada &lt;ada@example.com&gt; wrote:/);
  assert.match(reply.html, /the café/);
  assert.doesNotMatch(reply.html, /script|tracker\.example|hidden@example\.net/i);
  assert.match(reply.warnings.join(" "), /notes\.pdf/);

  const forward = buildDraft({ ...view, subject: "Fw: Fw: Café menu" }, "forward", ["you@example.com"]);
  assert.equal(forward.subject, "Fwd: Café menu");
  assert.deepEqual(forward.to, []);
  assert.deepEqual(forward.cc, []);
  assert.equal(forward.inReplyTo, "");
  assert.deepEqual(forward.references, ["<letter-0@example.com>", "<letter-1@example.com>"]);
  assert.match(forward.html, /Forwarded message/);
  assert.match(forward.html, /From: Ada &lt;ada@example.com&gt;/);
  assert.match(forward.html, /To: You &lt;you@example.com&gt;/);
  assert.match(forward.html, /Cc: Pat &lt;pat@example.com&gt;/);
  assert.doesNotMatch(forward.html, /Bcc|hidden@example\.net|tracker\.example|script/i);

  const textOnly = buildDraft({
    subject: "Привет",
    from_name: "",
    from_email: "mina@example.com",
    to: [{ email: "you@example.com" }],
    cc: [],
    text: "Line one\n\nこんにちは",
    html: "",
    headers: [{ name: "Message-ID", value: "<plain-1@example.com>" }],
  }, "reply", []);
  assert.equal(textOnly.subject, "Re: Привет");
  assert.match(textOnly.html, /こんにちは/);
  assert.match(htmlToPlain(textOnly.html), /Line one/);
  assert.match(htmlToPlain(textOnly.html), /こんにちは/);

  const htmlOnly = buildDraft({
    subject: "Notice",
    from_email: "news@example.com",
    to: [{ email: "you@example.com" }],
    html: "<p>Only <i>html</i></p>",
    headers: [],
  }, "forward", []);
  assert.match(htmlOnly.html, /Only/);
  assert.match(htmlOnly.warnings.join(" "), /no Message-ID/);
  assert.equal(htmlOnly.inReplyTo, "");
  assert.deepEqual(htmlOnly.references, []);
});

test("long reference chains keep the current message and drop the oldest ids", () => {
  const old = Array.from({ length: 80 }, (_, index) => `<reference-${String(index).padStart(4, "0")}-older-thread@example.com>`);
  const thread = threadingFromHeaders([
    { name: "Message-ID", value: "<current@example.com>" },
    { name: "References", value: old.join(" ") },
  ]);
  assert.equal(thread.trimmed, true);
  assert.equal(thread.references.at(-1), "<current@example.com>");
  assert.ok(thread.references.join(" ").length <= 1800);
  assert.equal(thread.references.includes(old[0]), false);
});

test("send reports queued mail without calling it delivered", async () => {
  resetSendLedger();
  let calls = 0;
  let seen = null;
  const fetcher = async (url, init) => {
    calls += 1;
    seen = { url, init, body: JSON.parse(init.body) };
    return providerOk({
      delivered: [],
      queued: ["ada@example.com", "hidden@example.net"],
      permanent_bounces: [],
      message_id: "<queued@example.com>",
    });
  };
  const result = await sendMessage(configured(fetcher), messageBody(), "idempotency-key-queued");
  assert.equal(calls, 1);
  assert.equal(result.outcome, "queued");
  assert.equal(result.outcome === "delivered", false);
  assert.match(seen.url, /\/accounts\/0123456789abcdef0123456789abcdef\/email\/sending\/send$/);
  assert.equal(seen.init.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(seen.body.from.address, FROM);
  assert.deepEqual(seen.body.bcc, ["hidden@example.net"]);
  assert.equal(JSON.stringify(seen.body.headers || {}).includes("hidden@example.net"), false);
  assert.equal(JSON.stringify(seen.init.body).includes(TOKEN), false);
});

test("a duplicate send reuses the first result and does not call the provider again", async () => {
  resetSendLedger();
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const fetcher = async () => {
    calls += 1;
    await gate;
    return providerOk({ delivered: ["ada@example.com"], queued: [], permanent_bounces: [], message_id: "<sent@example.com>" });
  };
  const env = configured(fetcher);
  const first = sendMessage(env, messageBody({ bcc: [] }), "idempotency-key-same1");
  const second = sendMessage(env, messageBody({ bcc: [] }), "idempotency-key-same1");
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.equal(left.outcome, "delivered");
  assert.equal(right.outcome, "delivered");
  const again = await sendMessage(env, messageBody({ bcc: [] }), "idempotency-key-same1");
  assert.equal(again.duplicate, true);
  assert.equal(calls, 1);
});

test("ambiguous provider failures are not retried", async () => {
  resetSendLedger();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    throw new Error("socket hang up");
  };
  const env = configured(fetcher);
  await assert.rejects(sendMessage(env, messageBody(), "idempotency-key-ambig1"), (error) => error.status === 502 && error.ambiguous);
  assert.equal(calls, 1);
  await assert.rejects(sendMessage(env, messageBody(), "idempotency-key-ambig1"), (error) => error.status === 409);
  assert.equal(calls, 1);

  resetSendLedger();
  calls = 0;
  const refused = async () => new Response(JSON.stringify({
    success: false,
    errors: [{ code: 7000, message: "Sender domain is not verified" }],
  }), { status: 400 });
  await assert.rejects(sendMessage(configured(refused), messageBody(), "idempotency-key-reject"), (error) => {
    return error.status === 400 && /not verified/.test(error.message) && !error.ambiguous;
  });
  assert.equal(calls, 0);
});

test("provider rejection count stays at one call", async () => {
  resetSendLedger();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return new Response(JSON.stringify({ success: false, errors: [{ code: 7000, message: "Sender domain is not verified" }] }), { status: 400 });
  };
  await assert.rejects(sendMessage(configured(fetcher), messageBody(), "idempotency-key-once01"), /not verified/);
  assert.equal(calls, 1);
});

test("http send enforces auth, csrf, unsafe content, and an unconfigured worker", async () => {
  resetSendLedger();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return providerOk({ delivered: [], queued: ["ada@example.com"], permanent_bounces: [], message_id: "<id@example.com>" });
  };
  const missing = await postSend({ MAIL: {}, EMAIL_FETCH: fetcher }, messageBody(), "idempotency-key-missing");
  assert.equal(missing.status, 503);
  assert.match(missing.body.error, /MAIL_FROM/);
  assert.match(missing.body.error, /EMAIL_API_TOKEN/);
  assert.match(missing.body.error, /docs\/outbound\.md/);
  assert.match(missing.body.error, /Nothing was sent/);
  assert.equal(calls, 0);

  const blocked = await worker.fetch(new Request("https://inbox.example/api/send", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "idempotency-key-noauth" },
    body: JSON.stringify(messageBody()),
  }), configured(fetcher, { ACCESS_TEAM_DOMAIN: "myteam.cloudflareaccess.com", ACCESS_AUD: "audience" }));
  assert.equal(blocked.status, 403);
  assert.match(await blocked.text(), /Access token missing/);
  assert.equal(calls, 0);

  const cross = await postSend(configured(fetcher), messageBody(), "idempotency-key-csrf01", { origin: "https://evil.example" });
  assert.equal(cross.status, 403);
  const site = await postSend(configured(fetcher), messageBody(), "idempotency-key-csrf02", { "sec-fetch-site": "cross-site" });
  assert.equal(site.status, 403);
  assert.equal(calls, 0);

  const unsafe = await postSend(configured(fetcher), {
    to: ["ada@example.com"],
    subject: "Hello\r\nBcc: hidden@example.net",
    html: '<p>Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="https://tracker.example/p.png">',
    from: "ceo@example.com",
  }, "idempotency-key-unsafe1");
  assert.equal(unsafe.status, 200);
  assert.equal(unsafe.body.outcome, "queued");
  assert.equal(calls, 1);
});

test("accepted send strips unsafe html and never uses a client from address", async () => {
  resetSendLedger();
  let captured = null;
  const fetcher = async (url, init) => {
    captured = JSON.parse(init.body);
    return providerOk({ delivered: [], queued: ["ada@example.com"], permanent_bounces: [], message_id: "<id@example.com>" });
  };
  const response = await postSend(configured(fetcher), {
    to: ["Ada <ada@example.com>"],
    cc: [],
    bcc: ["hidden@example.net"],
    subject: "Hello\r\nBcc: injected@example.net",
    html: '<p>Hi café</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="https://tracker.example/p.png"><p>Next paragraph.</p>',
    from: "ceo@example.com",
    headers: { Bcc: "hidden@example.net" },
  }, "idempotency-key-clean01");
  assert.equal(response.status, 200);
  assert.equal(response.body.outcome, "queued");
  assert.notEqual(response.body.outcome, "delivered");
  assert.equal(captured.from.address, FROM);
  assert.equal(captured.subject, "Hello Bcc: injected@example.net");
  assert.doesNotMatch(captured.html, /script|javascript:|tracker\.example|<img/i);
  assert.match(captured.html, /Hi café/);
  assert.match(captured.text, /Hi café/);
  assert.match(captured.text, /Next paragraph/);
  assert.deepEqual(captured.bcc, ["hidden@example.net"]);
  assert.equal(JSON.stringify(captured.headers || {}).toLowerCase().includes("bcc"), false);
  assert.equal(JSON.stringify({ ...captured, bcc: undefined }).includes("hidden@example.net"), false);
});

function fakeBucket(entries) {
  return {
    async list({ prefix }) {
      return {
        objects: entries.filter((entry) => entry.key.startsWith(prefix)).map((entry) => ({
          key: entry.key,
          size: entry.body.byteLength,
          etag: entry.key,
          httpEtag: entry.key,
          uploaded: entry.uploaded,
        })),
        truncated: false,
      };
    },
    async get(key) {
      const entry = entries.find((item) => item.key === key);
      if (!entry) return null;
      return {
        key,
        size: entry.body.byteLength,
        etag: key,
        httpEtag: key,
        uploaded: entry.uploaded,
        async arrayBuffer() {
          return entry.body.buffer.slice(entry.body.byteOffset, entry.body.byteOffset + entry.body.byteLength);
        },
      };
    },
  };
}

const rich = new TextEncoder().encode([
  "From: Ada Lovelace <ada@example.com>",
  "To: You <you@example.com>, Bob <bob@example.com>",
  "Cc: Pat <pat@example.com>",
  "Bcc: Hidden <hidden@example.net>",
  "Reply-To: Replies <replies@example.com>",
  "Subject: =?utf-8?q?Caf=C3=A9?=",
  "Date: Tue, 13 Oct 2026 15:04:00 -0500",
  "Message-ID: <letter-1@example.com>",
  "References: <letter-0@example.com>",
  "MIME-Version: 1.0",
  "Content-Type: multipart/mixed; boundary=BOUND",
  "",
  "--BOUND",
  "Content-Type: multipart/alternative; boundary=ALT",
  "",
  "--ALT",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Plain café note.",
  "",
  "--ALT",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<p>Rich <b>café</b> note.</p><script>alert(1)</script><img src=\"https://tracker.example/x.png\">",
  "--ALT--",
  "--BOUND",
  "Content-Type: application/pdf",
  "Content-Disposition: attachment; filename=notes.pdf",
  "Content-Transfer-Encoding: base64",
  "",
  "JVBERg==",
  "",
  "--BOUND--",
  "",
].join("\r\n"));

const textOnly = new TextEncoder().encode([
  "From: Mina <mina@example.com>",
  "To: you@example.com",
  "Subject: =?utf-8?b?0J/RgNC40LLQtdGC?=",
  "Date: Wed, 14 Oct 2026 12:00:00 +0000",
  "Message-ID: <plain-1@example.com>",
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Line one",
  "",
  "こんにちは",
  "",
].join("\r\n"));

const htmlOnly = new TextEncoder().encode([
  "From: News <news@example.com>",
  "To: you@example.com",
  "Subject: Notice",
  "Date: Thu, 15 Oct 2026 12:00:00 +0000",
  "MIME-Version: 1.0",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<html><body><p>Only html</p><img src=\"https://tracker.example/n.png\"></body></html>",
  "",
].join("\r\n"));

test("draft endpoint quotes multipart, text, and html originals without sending", async () => {
  resetCaches();
  let calls = 0;
  const env = configured(() => { calls += 1; throw new Error("should not send"); }, {
    MAIL: fakeBucket([
      { key: "inbound/2026/10/13/rich.eml", uploaded: new Date("2026-10-13T20:04:00Z"), body: rich },
      { key: "inbound/2026/10/14/text.eml", uploaded: new Date("2026-10-14T12:00:00Z"), body: textOnly },
      { key: "inbound/2026/10/15/html.eml", uploaded: new Date("2026-10-15T12:00:00Z"), body: htmlOnly },
    ]),
    ACCESS_TEAM_DOMAIN: "",
    ACCESS_AUD: "",
  });
  const load = async (key, mode) => {
    const response = await worker.fetch(new Request(`https://inbox.example/api/compose?key=${encodeURIComponent(key)}&mode=${mode}`), env);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const reply = await load("inbound/2026/10/13/rich.eml", "reply");
  assert.equal(reply.subject, "Re: Café");
  assert.deepEqual(reply.to.map((item) => item.email), ["replies@example.com"]);
  assert.deepEqual(reply.bcc, []);
  assert.equal(reply.inReplyTo, "<letter-1@example.com>");
  assert.deepEqual(reply.references, ["<letter-0@example.com>", "<letter-1@example.com>"]);
  assert.match(reply.html, /Tue, 13 Oct 2026 15:04:00 -0500/);
  assert.match(reply.html, /Rich/);
  assert.match(reply.html, /café/);
  assert.doesNotMatch(JSON.stringify(reply), /hidden@example\.net|tracker\.example|<script/i);
  assert.match(reply.warnings.join(" "), /notes\.pdf/);

  const all = await load("inbound/2026/10/13/rich.eml", "reply-all");
  assert.deepEqual(all.to.map((item) => item.email), ["replies@example.com"]);
  assert.deepEqual(all.cc.map((item) => item.email), ["bob@example.com", "pat@example.com"]);
  assert.equal(JSON.stringify(all).includes("you@example.com"), false);
  assert.equal(JSON.stringify(all).includes("hidden@example.net"), false);

  const forward = await load("inbound/2026/10/13/rich.eml", "forward");
  assert.equal(forward.subject, "Fwd: Café");
  assert.deepEqual(forward.to, []);
  assert.match(forward.html, /Forwarded message/);
  assert.doesNotMatch(forward.html, /hidden@example\.net/);

  const plain = await load("inbound/2026/10/14/text.eml", "reply");
  assert.equal(plain.subject, "Re: Привет");
  assert.match(plain.html, /こんにちは/);
  assert.match(htmlToPlain(plain.html), /Line one/);

  const notice = await load("inbound/2026/10/15/html.eml", "forward");
  assert.match(notice.html, /Only html/);
  assert.doesNotMatch(notice.html, /tracker\.example/);
  assert.match(notice.warnings.join(" "), /no Message-ID/);
  assert.equal(calls, 0);
});

test("inbox page has compose, reply, and forward controls", async () => {
  const { PAGE } = await import("../src/page.js");
  assert.match(PAGE, /id="compose-open"/);
  assert.match(PAGE, /id="editor"/);
  assert.match(PAGE, /aria-label="Message body"/);
  assert.match(PAGE, /id="reply"/);
  assert.match(PAGE, /id="reply-all"/);
  assert.match(PAGE, /id="forward"/);
  assert.match(PAGE, /id="bcc-row" hidden/);
  assert.match(PAGE, /Discard this unsent message\?/);
  assert.match(PAGE, /not confirmed as delivered/);
  assert.match(PAGE, /Images were left out/);
});

test("claimSend rejects a short idempotency key before any work", () => {
  assert.throws(() => claimSend("short", () => Promise.resolve({})), (error) => error.status === 400);
});
