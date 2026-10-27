import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import worker from "../src/index.js";
import { resetCaches } from "../src/store.js";
import { statusExplanation, statusJsonKey, emlKeyFromStatus } from "../src/status.js";

const sample = new TextEncoder().encode(`From: "Ada Lovelace" <ada@example.com>\r
To: You <you@example.com>\r
Cc: Pat <pat@example.com>\r
Subject: Hello =?utf-8?q?world?=\r
Date: Tue, 13 Oct 2026 15:04:00 -0500\r
MIME-Version: 1.0\r
Content-Type: multipart/mixed; boundary="BOUND"\r
\r
--BOUND\r
Content-Type: multipart/alternative; boundary="ALT"\r
\r
--ALT\r
Content-Type: text/plain; charset="utf-8"\r
\r
Plain snippet here.\r
\r
--ALT\r
Content-Type: text/html; charset="utf-8"\r
\r
<html><body><p>Hello <b>there</b></p><img src="cid:logo@example.com"><img src="https://tracker.example/x.png" onerror="alert(1)"><script>alert(1)</script><div style="background:url(https://tracker.example/bg.png)"></div></body></html>\r
--ALT--\r
--BOUND\r
Content-Type: image/png\r
Content-Transfer-Encoding: base64\r
Content-ID: <logo@example.com>\r
Content-Disposition: inline; filename="logo.png"\r
\r
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==\r
\r
--BOUND\r
Content-Type: application/pdf\r
Content-Transfer-Encoding: base64\r
Content-Disposition: attachment; filename="notes.pdf"\r
\r
JVBERg==\r
\r
--BOUND--\r
`);

const older = new TextEncoder().encode(`From: Bob <bob@example.com>\r
To: you@example.com\r
Subject: Older note\r
Date: Mon, 01 Jan 2024 00:00:00 +0000\r
MIME-Version: 1.0\r
Content-Type: text/plain; charset="utf-8"\r
\r
Just a note.\r
`);

function fakeBucket(entries) {
  return {
    async list({ prefix }) {
      const objects = entries
        .filter((entry) => entry.key.startsWith(prefix))
        .map((entry) => ({
          key: entry.key,
          size: entry.body.byteLength,
          etag: entry.key,
          httpEtag: entry.key,
          uploaded: entry.uploaded,
        }));
      return { objects, truncated: false };
    },
    async get(key, options) {
      const entry = entries.find((item) => item.key === key);
      if (!entry) return null;
      const range = options && options.range;
      let bytes = entry.body;
      let ranged = false;
      if (range && range.length < entry.body.byteLength) {
        bytes = entry.body.slice(range.offset || 0, (range.offset || 0) + range.length);
        ranged = true;
      }
      return {
        key,
        size: entry.body.byteLength,
        etag: key,
        httpEtag: key,
        uploaded: entry.uploaded,
        range: ranged ? { offset: 0, length: bytes.byteLength } : undefined,
        async arrayBuffer() {
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        },
      };
    },
    async head(key) {
      const entry = entries.find((item) => item.key === key);
      return entry ? { key, size: entry.body.byteLength, etag: key, httpEtag: key, uploaded: entry.uploaded } : null;
    },
    async delete(keys) {
      for (const key of [].concat(keys)) {
        const index = entries.findIndex((item) => item.key === key);
        if (index >= 0) entries.splice(index, 1);
      }
    },
  };
}

function bucket() {
  const json = (value) => new TextEncoder().encode(JSON.stringify(value));
  return fakeBucket([
    { key: "inbound/2026/10/13/new.eml", uploaded: new Date("2026-10-13T20:00:00Z"), body: sample },
    { key: "inbound/2024/01/01/old.eml", uploaded: new Date("2024-01-01T00:00:00Z"), body: older },
    { key: "inbound/notes.txt", uploaded: new Date("2026-10-13T20:00:00Z"), body: new Uint8Array([1]) },
    {
      key: "failed/2026/10/13/new.json",
      uploaded: new Date("2026-10-13T20:00:00Z"),
      body: json({
        reason: "forward_failed",
        error: "non-authenticated emails cannot be forwarded",
        key: "inbound/2026/10/13/new.eml",
      }),
    },
    {
      key: "dropped/2024/01/01/old.json",
      uploaded: new Date("2024-01-01T00:00:00Z"),
      body: json({ dropped: "sender:ada@example.com", key: "inbound/2024/01/01/old.eml" }),
    },
    {
      key: "failed/2024/01/01/old.json",
      uploaded: new Date("2024-01-01T00:00:00Z"),
      body: json({
        reason: "forward_failed",
        error: "non-authenticated emails cannot be forwarded",
      }),
    },
    {
      key: "dropped/2026/99/99/orphan.json",
      uploaded: new Date("2026-10-13T20:00:00Z"),
      body: json({ dropped: "should-not-appear" }),
    },
  ]);
}

async function get(path) {
  resetCaches();
  const response = await worker.fetch(new Request("https://inbox.example" + path), {
    MAIL: bucket(),
    BUCKET_NAME: "my-mail-bucket",
  });
  const body = await response.text();
  return { status: response.status, body, headers: response.headers };
}

test("status files map onto the inbound message", () => {
  assert.equal(statusExplanation("dropped", { dropped: "sender:ada@example.com" }), "sender:ada@example.com");
  assert.equal(
    statusExplanation("failed", {
      reason: "forward_failed",
      error: "non-authenticated emails cannot be forwarded",
    }),
    "forward_failed: non-authenticated emails cannot be forwarded",
  );
  assert.equal(statusJsonKey("inbound/2026/10/13/new.eml", "failed/"), "failed/2026/10/13/new.json");
  assert.equal(emlKeyFromStatus("dropped/2024/01/01/old.json", "dropped/"), "inbound/2024/01/01/old.eml");
});

test("inbox page has pills and background refresh, and no folder rail", async () => {
  const page = await get("/");
  assert.equal(page.status, 200);
  assert.match(page.body, /Inbox/);
  assert.match(page.body, /backgroundRefresh/);
  assert.match(page.body, /status-pills/);
  assert.doesNotMatch(page.body, /data-folder/);
});

test("list and open messages with dropped and failed reasons", async () => {
  const listed = await get("/api/messages");
  assert.equal(listed.status, 200);
  const payload = JSON.parse(listed.body);
  assert.equal(payload.total, 2);
  assert.equal(payload.messages[0].subject, "Hello world");
  assert.equal(payload.messages[0].snippet, "Plain snippet here.");
  assert.deepEqual(payload.messages[0].statuses, [{ id: "failed", label: "Failed" }]);
  assert.equal(payload.messages[0].statuses[0].reason, undefined);
  assert.deepEqual(
    payload.messages[1].statuses.map((item) => item.label),
    ["Dropped", "Failed"],
  );
  assert.equal(JSON.stringify(payload.messages).includes("should-not-appear"), false);

  const opened = await get("/api/message?key=" + encodeURIComponent(payload.messages[0].key));
  const message = JSON.parse(opened.body);
  assert.equal(opened.status, 200);
  assert.equal(message.from_name, "Ada Lovelace");
  assert.equal(message.from_email, "ada@example.com");
  assert.equal(message.statuses[0].reason, "forward_failed: non-authenticated emails cannot be forwarded");
  assert.deepEqual(
    message.attachments.map((file) => file.filename),
    ["notes.pdf"],
  );

  const old = await get("/api/message?key=" + encodeURIComponent(payload.messages[1].key));
  const olderMessage = JSON.parse(old.body);
  assert.equal(olderMessage.statuses[0].reason, "sender:ada@example.com");
  assert.equal(olderMessage.statuses[1].reason, "forward_failed: non-authenticated emails cannot be forwarded");
});

test("message html keeps the body, blocks scripts, and loads remote images only when asked", async () => {
  const hidden = await get("/body?key=" + encodeURIComponent("inbound/2026/10/13/new.eml") + "&images=0");
  assert.equal(hidden.status, 200);
  assert.match(hidden.body, /there/);
  assert.doesNotMatch(hidden.body, /tracker\.example/);
  assert.doesNotMatch(hidden.body, /<script/i);
  assert.doesNotMatch(hidden.body, /onerror/i);
  assert.match(hidden.body, /\/part\?/);

  const shown = await get("/body?key=" + encodeURIComponent("inbound/2026/10/13/new.eml") + "&images=1");
  assert.match(shown.body, /tracker\.example/);
});

test("attachments download and foreign keys are refused", async () => {
  const opened = await get("/api/message?key=" + encodeURIComponent("inbound/2026/10/13/new.eml"));
  const message = JSON.parse(opened.body);
  const file = message.attachments[0];
  const part = await get(`/part?key=${encodeURIComponent(message.key)}&i=${file.index}&download=1`);
  assert.equal(part.status, 200);
  assert.match(part.headers.get("content-type"), /application\/pdf/);
  assert.match(part.headers.get("content-disposition"), /notes\.pdf/);

  const jsonKey = await get("/api/message?key=" + encodeURIComponent("dropped/2024/01/01/old.json"));
  assert.equal(jsonKey.status, 400);
  const outside = await get("/api/message?key=" + encodeURIComponent("other/nope.eml"));
  assert.equal(outside.status, 400);
  const ignored = await get("/api/messages?folder=dropped");
  assert.equal(JSON.parse(ignored.body).total, 2);
});

test("sort, list time and day groups all use the received time, not the Date header", async () => {
  const mail = (subject, date) => new TextEncoder().encode(`From: x@example.com\r
To: you@example.com\r
Subject: ${subject}\r
Date: ${date}\r
Content-Type: text/plain\r
\r
body\r
`);
  const entries = [
    // Sent late Oct 14 (Central), arrived 10:09 UTC Oct 15, R2 upload a moment later.
    {
      key: "inbound/2026/10/15/20261015T100937709Z-58d6c7909b3e9557.eml",
      uploaded: new Date("2026-10-15T10:09:38Z"),
      body: mail("VIP Movement", "14 Oct 2026 22:19:11 -0500"),
    },
    {
      key: "inbound/2026/10/15/20261015T100300000Z-aaaa.eml",
      uploaded: new Date("2026-10-15T10:03:01Z"),
      body: mail("Registrar", "Thu, 15 Oct 2026 10:03:00 +0000"),
    },
    {
      key: "inbound/2026/10/15/20261015T105700000Z-bbbb.eml",
      uploaded: new Date("2026-10-15T10:57:01Z"),
      body: mail("Better Living", "Thu, 15 Oct 2026 10:57:00 +0000"),
    },
    // Key has no timestamp: falls back to the R2 upload time.
    { key: "inbound/2026/10/14/plain.eml", uploaded: new Date("2026-10-14T18:00:00Z"), body: mail("VA", "Wed, 14 Oct 2026 18:00:00 +0000") },
  ];
  resetCaches();
  const response = await worker.fetch(new Request("https://inbox.example/api/messages"), { MAIL: fakeBucket(entries) });
  const payload = JSON.parse(await response.text());
  assert.deepEqual(payload.messages.map((m) => m.subject), ["Better Living", "VIP Movement", "Registrar", "VA"]);
  assert.equal(payload.messages[1].received, "2026-10-15T10:09:37.709Z");
  assert.equal(payload.messages[3].received, "2026-10-14T18:00:00.000Z");
  const times = payload.messages.map((m) => Date.parse(m.received));
  assert.deepEqual([...times].sort((a, b) => b - a), times);
  const { keyTime, receivedTime } = await import("../src/store.js");
  assert.equal(keyTime("inbound/2026/13/40/20261340T000000Z-x.eml"), null);
  assert.equal(receivedTime({ key: "inbound/x.eml", last_modified: null }, "14 Oct 2026 22:19:11 -0500"), "2026-10-15T03:19:11.000Z");

  const page = await get("/");
  assert.match(page.body, /return message\.received \|\| message\.last_modified \|\| message\.date;/);
});

test("delete removes the message and its status records, and refuses anything else", async () => {
  const json = (value) => new TextEncoder().encode(JSON.stringify(value));
  const key = "inbound/2026/10/15/20261015T145440052Z-aecf3e429724e3d7.eml";
  const stem = "20261015T145440052Z-aecf3e429724e3d7";
  const when = new Date("2026-10-15T14:54:41Z");
  const entries = [
    { key, uploaded: when, body: sample },
    { key: "inbound/2024/01/01/old.eml", uploaded: new Date("2024-01-01T00:00:00Z"), body: older },
    { key: `failed/2026/10/15/${stem}.json`, uploaded: when, body: json({ reason: "forward_failed" }) },
    { key: `dropped/2026/10/15/${stem}.json`, uploaded: when, body: json({ dropped: "sender:x", key }) },
    { key: `failed/replayed/${stem}.json`, uploaded: when, body: json({ reason: "retry", key }) },
    { key: `failed/other/${stem}.json`, uploaded: when, body: json({ reason: "retry", key: "inbound/2026/10/15/other.eml" }) },
    { key: "dropped/2024/01/01/old.json", uploaded: new Date("2024-01-01T00:00:00Z"), body: json({ dropped: "sender:y" }) },
    { key: "config/droplist.json", uploaded: when, body: json({ senders: [] }) },
  ];
  const env = { MAIL: fakeBucket(entries) };
  const call = async (body, init = {}) => {
    const response = await worker.fetch(new Request("https://inbox.example/api/delete", {
      method: "POST",
      headers: { "content-type": "application/json", ...(init.headers || {}) },
      body: JSON.stringify(body),
      ...(init.method ? { method: init.method, body: undefined } : {}),
    }), env);
    return { status: response.status, body: JSON.parse(await response.text()) };
  };
  resetCaches();

  for (const bad of [
    "config/droplist.json",
    `failed/2026/10/15/${stem}.json`,
    "inbound/old.eml",
    "inbound/2026/10/15/nested/x.eml",
    "inbound/2026/10/15/x.EML",
    "inbound/2026/10/15/x.eml.json",
    "inbound/26/10/15/x.eml",
    "inbound/2026/10/15/..\\x.eml",
    "/inbound/2026/10/15/x.eml",
    "",
  ]) {
    assert.equal((await call({ key: bad })).status, 400, bad);
  }
  assert.equal((await call({ key: [key] })).status, 400);
  assert.equal((await call({ key }, { method: "GET" })).status, 405);
  assert.equal((await call({ key }, { headers: { origin: "https://evil.example" } })).status, 403);
  assert.equal((await call({ key }, { headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  assert.equal((await call({ key }, { headers: { "content-type": "text/plain" } })).status, 415);
  assert.equal((await call({ key: "inbound/2026/10/15/missing.eml" })).status, 404);
  assert.equal(entries.length, 8);

  const before = JSON.parse(await (await worker.fetch(new Request("https://inbox.example/api/messages"), env)).text());
  assert.equal(before.total, 2);

  const done = await call({ key }, { headers: { origin: "https://inbox.example", "sec-fetch-site": "same-origin" } });
  assert.equal(done.status, 200);
  assert.equal(done.body.deleted, true);
  assert.equal(done.body.message, key);
  assert.deepEqual(done.body.removed.sort(), [
    `dropped/2026/10/15/${stem}.json`,
    `failed/2026/10/15/${stem}.json`,
    `failed/replayed/${stem}.json`,
    key,
  ]);
  assert.deepEqual(entries.map((entry) => entry.key).sort(), [
    "config/droplist.json",
    "dropped/2024/01/01/old.json",
    `failed/other/${stem}.json`,
    "inbound/2024/01/01/old.eml",
  ]);

  const after = JSON.parse(await (await worker.fetch(new Request("https://inbox.example/api/messages"), env)).text());
  assert.equal(after.total, 1);
  assert.equal(after.messages[0].key, "inbound/2024/01/01/old.eml");
  const gone = await worker.fetch(new Request("https://inbox.example/api/message?key=" + encodeURIComponent(key)), env);
  assert.equal(gone.status, 404);
  assert.equal((await call({ key })).status, 404);

  const page = await get("/");
  assert.match(page.body, /Delete this email permanently\?/);
  assert.match(page.body, /\/api\/delete/);
});

test("headers drill-down has a copy button with clipboard fallback", async () => {
  const page = await get("/");
  assert.match(page.body, /id="copy-headers" type="button" aria-label="Copy headers to clipboard"/);
  assert.match(page.body, /clipboard\.writeText\(text\)/);
  assert.match(page.body, /doc\.execCommand\("copy"\)/);
  assert.match(page.body, /"Copied" : "Copy failed"/);
  assert.match(page.body, /doc\.addEventListener\("click", onClick\)/);
  assert.match(page.body, /<details id="header-block">[\s\S]*id="copy-headers"[\s\S]*<pre id="headers"><\/pre>/);
});

async function copyHarness({ clipboard = "ok", secure = true, focused = true, exec = true } = {}) {
  const page = await get("/");
  const source = page.body.split("// copy-headers:start")[1].split("// copy-headers:end")[0];
  const log = { writes: [], execs: 0, appended: 0, removed: 0 };
  let timers = [];
  const make = (tag) => {
    const el = {
      tag,
      attrs: {},
      style: {},
      textContent: "",
      value: "",
      setAttribute(name, value) { this.attrs[name] = value; },
      getAttribute(name) { return this.attrs[name]; },
      focus() { doc.active = this; },
      select() {},
      setSelectionRange() {},
      remove() { log.removed += 1; },
      closest(selector) { return selector === "#copy-headers" && this.id === "copy-headers" ? this : this.parent ? this.parent.closest(selector) : null; },
      querySelector(selector) { return selector === "span" ? this.span : null; },
    };
    return el;
  };
  const elements = {};
  const newButton = () => {
    const button = make("button");
    button.id = "copy-headers";
    button.span = make("span");
    button.span.textContent = "Copy";
    button.span.parent = button;
    button.setAttribute("aria-label", "Copy headers to clipboard");
    elements["copy-headers"] = button;
    return button;
  };
  newButton();
  elements.headers = make("pre");
  elements["copy-status"] = make("span");
  let listener = null;
  const doc = {
    active: null,
    body: { appendChild() { log.appended += 1; } },
    createElement: make,
    getElementById: (id) => elements[id] || null,
    addEventListener(type, fn) { assert.equal(type, "click"); listener = fn; },
    hasFocus: () => focused,
    execCommand(command) { assert.equal(command, "copy"); log.execs += 1; return exec; },
  };
  const navigator = {};
  if (clipboard) {
    navigator.clipboard = {
      writeText(text) {
        log.writes.push(text);
        if (clipboard === "ok") return Promise.resolve();
        if (clipboard === "reject") return Promise.reject(new Error("NotAllowedError"));
        return new Promise(() => {});
      },
    };
  }
  const win = {
    navigator,
    isSecureContext: secure,
    getSelection: () => ({ removeAllRanges() {} }),
    setTimeout(fn, ms) { const t = { fn, ms, live: true }; timers.push(t); return t; },
    clearTimeout(t) { if (t) t.live = false; },
  };
  const context = { doc, win };
  vm.runInNewContext(source + "\nresult = setupHeaderCopy(doc, win);", context);
  assert.ok(listener, "listener is delegated on document");
  const click = async (target = elements["copy-headers"]) => {
    let stopped = false;
    let prevented = false;
    const ok = await listener({ target, stopPropagation() { stopped = true; }, preventDefault() { prevented = true; } });
    return { ok, stopped, prevented };
  };
  const fire = (ms) => {
    const due = timers.filter((t) => t.live && t.ms === ms);
    timers = timers.filter((t) => !due.includes(t));
    for (const t of due) { t.live = false; t.fn(); }
    return due.length;
  };
  const label = () => elements["copy-headers"].span.textContent;
  return { elements, log, click, fire, label, newButton };
}

test("headers copy works on every click, not just the first", async () => {
  const h = await copyHarness();
  h.elements.headers.textContent = "From: a@example.com\nSubject: One";
  for (let i = 0; i < 5; i += 1) {
    const result = await h.click();
    assert.equal(result.ok, true);
    assert.equal(result.stopped, true);
    assert.equal(h.label(), "Copied");
  }
  assert.equal(h.log.writes.length, 5);
  assert.ok(h.log.writes.every((text) => text === "From: a@example.com\nSubject: One"));
  h.fire(2000);
  assert.equal(h.label(), "Copy");
  assert.equal(h.elements["copy-headers"].getAttribute("aria-label"), "Copy headers to clipboard");
  assert.equal((await h.click()).ok, true);
  assert.equal(h.log.writes.length, 6);
  assert.equal(h.elements["copy-headers"].attrs.disabled, undefined);
});

test("headers copy reads the open message at click time and survives a re-rendered button", async () => {
  const h = await copyHarness();
  h.elements.headers.textContent = "Subject: First";
  await h.click();
  h.elements.headers.textContent = "Subject: Second";
  await h.click();
  const replaced = h.newButton();
  h.elements.headers.textContent = "Subject: Third";
  await h.click(replaced.span);
  assert.deepEqual(h.log.writes, ["Subject: First", "Subject: Second", "Subject: Third"]);
  assert.equal(replaced.span.textContent, "Copied");
});

test("headers copy falls back when the clipboard API is missing, rejects, or hangs", async () => {
  for (const options of [{ clipboard: null }, { secure: false }, { focused: false }]) {
    const h = await copyHarness(options);
    h.elements.headers.textContent = "Subject: Fallback";
    assert.equal((await h.click()).ok, true);
    assert.equal((await h.click()).ok, true);
    assert.equal(h.log.execs, 2);
    assert.equal(h.log.appended, h.log.removed);
  }
  const rejected = await copyHarness({ clipboard: "reject" });
  rejected.elements.headers.textContent = "Subject: Rejected";
  assert.equal((await rejected.click()).ok, true);
  assert.equal(rejected.log.execs, 1);

  const hung = await copyHarness({ clipboard: "hang", exec: false });
  hung.elements.headers.textContent = "Subject: Hung";
  const pending = hung.click();
  assert.equal(hung.fire(1500), 1);
  assert.equal((await pending).ok, false);
  assert.equal(hung.label(), "Copy failed");
  hung.fire(2000);
  assert.equal(hung.label(), "Copy");
  const again = hung.click();
  hung.fire(1500);
  assert.equal((await again).ok, false, "a stuck write does not wedge later clicks");
  assert.equal(hung.log.writes.length, 2);
});

test("unsubscribed.json marks the triggering email and later mail from that sender", async () => {
  const json = (value) => new TextEncoder().encode(JSON.stringify(value));
  const mk = (from, subject) => new TextEncoder().encode(`From: ${from}\r\nTo: you@example.com\r\nSubject: ${subject}\r\nDate: Thu, 15 Oct 2026 10:00:00 +0000\r\nContent-Type: text/plain\r\n\r\nhi\r\n`);
  const trig = "inbound/2026/10/15/20261015T100000000Z-aaaa.eml";
  const entries = [
    { key: trig, uploaded: new Date("2026-10-15T10:00:01Z"), body: mk("News <news@promo.example>", "Trigger") },
    { key: "inbound/2026/10/16/20261016T100000000Z-bbbb.eml", uploaded: new Date("2026-10-16T10:00:01Z"), body: mk("News <NEWS@promo.example>", "Later") },
    { key: "inbound/2026/10/16/20261016T110000000Z-cccc.eml", uploaded: new Date("2026-10-16T11:00:01Z"), body: mk("Friend <pal@ok.example>", "Other") },
    { key: "config/unsubscribed.json", uploaded: new Date(), body: json({
      keys: { [trig]: { status: "ok", method: "one-click", ts: "2026-10-21T18:30:00+00:00", sender: "news@promo.example" } },
      senders: { "news@promo.example": { key: trig, status: "ok", method: "one-click", ts: "2026-10-21T18:30:00+00:00" } },
    }) },
  ];
  resetCaches();
  const response = await worker.fetch(new Request("https://inbox.example/api/messages"), { MAIL: fakeBucket(entries) });
  const payload = JSON.parse(await response.text());
  const by = Object.fromEntries(payload.messages.map((m) => [m.subject, m.statuses.map((s) => s.id + ":" + s.label)]));
  assert.deepEqual(by.Trigger, ["unsubscribed:Unsubscribed"]);
  assert.deepEqual(by.Later, ["unsubscribed-sender:Unsub'd sender"]);
  assert.deepEqual(by.Other, []);
  assert.equal(payload.total, 3);

  resetCaches();
  const bare = await worker.fetch(new Request("https://inbox.example/api/messages"), { MAIL: fakeBucket(entries.slice(0, 3)) });
  assert.ok(JSON.parse(await bare.text()).messages.every((m) => m.statuses.length === 0));

  const page = await get("/");
  assert.match(page.body, /\.pill\.unsubscribed \{/);
  assert.match(page.body, /\.pill\.unsubscribed-sender \{/);
  assert.match(page.body, /"unsubscribed", "unsubscribed-sender"\]\.includes\(status\.id\)/);
  const fn = page.body.match(/function fillPills\(container, statuses\) \{[\s\S]*?\n\}\n/)[0];
  const box = { kids: [], replaceChildren() { this.kids = []; }, appendChild(el) { this.kids.push(el); } };
  const document = { createElement: () => ({}) };
  vm.runInNewContext(fn + "fillPills(box, rows);", { box, document, rows: [...by.Trigger, ...by.Later].map((s) => ({ id: s.split(":")[0], label: s.split(":")[1], title: "t" })) });
  assert.deepEqual(box.kids.map((el) => [el.className, el.textContent, el.title]), [
    ["pill unsubscribed", "Unsubscribed", "t"],
    ["pill unsubscribed-sender", "Unsub'd sender", "t"],
  ]);
});

test("message ID is the .eml filename, sits below date and size in the reader, and is tap-to-copy", async () => {
  const page = await get("/");
  const src = /\/\/ message-id:start([\s\S]*?)\/\/ message-id:end/.exec(page.body)[1];
  const ctx = {};
  vm.runInNewContext(src + "\nthis.messageId = messageId;", ctx);
  assert.equal(ctx.messageId("inbound/2026/10/26/20261026T223527752Z-94cf493cd2b4bc72.eml"), "20261026T223527752Z-94cf493cd2b4bc72");
  assert.equal(ctx.messageId("inbound/2026/10/26/X.EML"), "X");
  assert.equal(ctx.messageId(""), "");
  assert.match(page.body, /<div id="when"><\/div>\s*<div id="msg-id-line"><button id="msg-id" type="button"/);
  assert.doesNotMatch(page.body, /copy-id|midRow|mid-copy/);
  assert.match(page.body, /getElementById\("msg-id"\)\.addEventListener\("click"/);
  assert.match(page.body, /"Copied" : "Copy failed"/);
  assert.match(page.body, /clip\.writeText\(text\)/);
  assert.match(page.body, /document\.execCommand\("copy"\)/);
});

test("swiping right in the reader goes back to the list; other gestures and wide content do not", async () => {
  const page = await get("/");
  const src = /\/\/ swipe-back:start([\s\S]*?)\/\/ swipe-back:end/.exec(page.body)[1];
  const ctx = {};
  vm.runInNewContext(src + "\nthis.setupSwipeBack = setupSwipeBack;", ctx);
  const handlers = {};
  const options = {};
  const root = { addEventListener: (type, fn, opt) => { handlers[type] = fn; options[type] = opt; } };
  let selection = "";
  const win = { setTimeout: (fn) => fn(), getSelection: () => ({ isCollapsed: !selection, toString: () => selection }), getComputedStyle: (el) => ({ overflowX: el.ox || "visible" }) };
  let backs = 0;
  ctx.setupSwipeBack(root, win, () => { backs += 1; });
  for (const type of ["touchstart", "touchend", "touchcancel"]) assert.equal(options[type].passive, true);
  const plain = { nodeType: 1, scrollWidth: 100, clientWidth: 100, parentElement: null, closest: () => null };
  const swipe = (target, x0, y0, x1, y1) => {
    handlers.touchstart({ target, touches: [{ clientX: x0, clientY: y0 }] });
    handlers.touchend({ target, changedTouches: [{ clientX: x1, clientY: y1 }] });
  };
  swipe(plain, 20, 100, 150, 120); assert.equal(backs, 1);
  swipe(plain, 150, 100, 20, 100); assert.equal(backs, 1, "left swipe");
  swipe(plain, 20, 100, 60, 100); assert.equal(backs, 1, "too short");
  swipe(plain, 20, 100, 100, 260); assert.equal(backs, 1, "mostly vertical");
  swipe({ ...plain, closest: () => ({}) }, 20, 100, 150, 100); assert.equal(backs, 1, "inside body/input");
  swipe({ ...plain, scrollWidth: 500, ox: "auto" }, 20, 100, 150, 100); assert.equal(backs, 1, "wide scroller");
  selection = "text"; swipe(plain, 20, 100, 150, 100); assert.equal(backs, 1, "selecting text"); selection = "";
  swipe(plain, 20, 100, 200, 100); assert.equal(backs, 2);
  assert.doesNotMatch(src, /preventDefault/);
});

test("after swipe-back, a single tap on a list row opens the message", async () => {
  const page = await get("/");
  const script = /<script>([\s\S]*)<\/script>/.exec(page.body)[1];
  assert.match(page.body, /@media \(hover: hover\) \{ \.row:hover/);
  assert.doesNotMatch(page.body, /\n  \.row:hover/);
  assert.match(page.body, /\.row \{ touch-action: manipulation/);
  const els = {};
  const listeners = {};
  const timers = [];
  function el(id) {
    if (!els[id]) {
      const own = {};
      els[id] = {
        id, hidden: false, textContent: "", style: {}, dataset: {}, children: [], _listeners: own,
        classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); }, toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); } },
        addEventListener(type, fn) { (own[type] ||= []).push(fn); },
        setAttribute() {}, appendChild(c) { this.children.push(c); return c; }, append(...c) { this.children.push(...c); },
        replaceChildren(...c) { this.children = c; }, querySelector() { return null; }, contains: () => false,
        scrollIntoView() {}, focus() {}, blur() {}, get childElementCount() { return this.children.length; },
        closest: () => null, nodeType: 1, scrollWidth: 0, clientWidth: 0, parentElement: null,
      };
    }
    return els[id];
  }
  let rows = [];
  const document = {
    hidden: false, body: el("body"), title: "",
    getElementById: el,
    createElement: (tag) => { const e = el("new" + Math.random()); e.tag = tag; return e; },
    querySelectorAll: (sel) => (sel === ".row" ? rows : []),
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    get activeElement() { return document.body; },
  };
  const origCreate = document.createElement;
  document.createElement = (tag) => { const e = origCreate(tag); if (tag === "button") rows.push(e); return e; };
  const messages = [{ key: "inbound/2026/10/26/a.eml", subject: "A" }, { key: "inbound/2026/10/26/b.eml", subject: "B" }];
  const fetched = [];
  const fetch = async (url) => {
    fetched.push(url);
    const body = url.startsWith("/api/messages") ? { messages, total: 2, matched: 2 } : { ...messages.find((m) => url.includes(encodeURIComponent(m.key))), headers: [] };
    return { ok: true, text: async () => JSON.stringify(body) };
  };
  const window = { setTimeout: (fn) => { timers.push(fn); return 1; }, clearTimeout() {}, getSelection: () => ({ isCollapsed: true }), getComputedStyle: () => ({ overflowX: "visible" }), navigator: {}, isSecureContext: false };
  const ctx = { document, window, fetch, navigator: {}, setTimeout: window.setTimeout, clearTimeout() {}, setInterval() {}, URLSearchParams, console, Date, Math, JSON, String, Number, Set, Promise };
  vm.runInNewContext(script, ctx);
  await new Promise((r) => setImmediate(r));
  el("list").contains = (node) => rows.includes(node);
  const focused = [];
  el("list").focus = () => focused.push("list");
  const tap = (row) => el("list")._listeners.click.forEach((fn) => fn({ target: { closest: (sel) => (sel === ".row" ? row : null) } }));
  const rowA = rows.find((r) => r._key === messages[0].key);
  const rowB = rows.find((r) => r._key === messages[1].key);

  tap(rowA);
  await new Promise((r) => setImmediate(r));
  assert.ok(el("app").classList.contains("reading-open"));
  const reading = el("reading")._listeners;
  const target = el("subject");
  reading.touchstart[0]({ target, touches: [{ clientX: 10, clientY: 100 }] });
  reading.touchend[0]({ target, changedTouches: [{ clientX: 200, clientY: 105 }] });
  while (timers.length) timers.shift()();
  assert.ok(!el("app").classList.contains("reading-open"), "back to list");
  const before = fetched.length;
  assert.ok(focused.length >= 1, "list focused after swipe-back");
  tap(rowB);
  assert.ok(el("app").classList.contains("reading-open"), "single tap opens the next message");
  await new Promise((r) => setImmediate(r));
  assert.ok(fetched.slice(before).some((u) => u.includes(encodeURIComponent(messages[1].key))));
  // Back button, then a single click on the first row.
  el("back")._listeners.click.forEach((fn) => fn());
  assert.ok(!el("app").classList.contains("reading-open"));
  tap(rowA);
  assert.ok(el("app").classList.contains("reading-open"), "single click after Back opens");
  assert.ok(!rows.some((r) => r._listeners.click), "rows rely on one delegated listener");
});
