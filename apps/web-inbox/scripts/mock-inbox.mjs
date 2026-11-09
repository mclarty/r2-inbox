#!/usr/bin/env node
// Local inbox with a fake mailbox and a fake Email Sending API.
// It does not read R2, does not call Cloudflare, and does not send mail.
import http from "node:http";
import worker from "../src/index.js";

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const messages = [
  {
    key: "inbound/2026/10/13/rich.eml",
    uploaded: new Date("2026-10-13T20:04:00Z"),
    body: mime([
      "From: Ada Lovelace <ada@example.com>",
      "To: You <you@example.com>, Bob <bob@example.com>",
      "Cc: Pat <pat@example.com>",
      "Bcc: Hidden <hidden@example.net>",
      "Reply-To: Replies <replies@example.com>",
      "Subject: =?utf-8?q?Caf=C3=A9_menu?=",
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
    ]),
  },
  {
    key: "inbound/2026/10/14/text.eml",
    uploaded: new Date("2026-10-14T12:00:00Z"),
    body: mime([
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
    ]),
  },
  {
    key: "inbound/2026/10/15/html.eml",
    uploaded: new Date("2026-10-15T12:00:00Z"),
    body: mime([
      "From: News <news@example.com>",
      "To: you@example.com",
      "Subject: Notice",
      "Date: Thu, 15 Oct 2026 12:00:00 +0000",
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>Only html, with a remote image that the composer must not load.</p><img src=\"https://tracker.example/n.png\">",
      "",
    ]),
  },
];

function mime(lines) {
  return new TextEncoder().encode(lines.join("\r\n"));
}

function bucket() {
  const records = new Map();
  let seq = 0;
  return {
    async list({ prefix }) {
      return {
        objects: messages.filter((entry) => entry.key.startsWith(prefix)).map((entry) => ({
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
      const record = records.get(key);
      if (record) {
        return {
          key,
          etag: record.etag,
          httpEtag: record.etag,
          json: async () => JSON.parse(record.body),
          text: async () => record.body,
          arrayBuffer: async () => new TextEncoder().encode(record.body).buffer,
        };
      }
      const entry = messages.find((item) => item.key === key);
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
    async head(key) {
      const entry = messages.find((item) => item.key === key);
      return entry ? { key, size: entry.body.byteLength, etag: key, uploaded: entry.uploaded } : null;
    },
    async put(key, value, options = {}) {
      if (!String(key).startsWith("outbound/sends/")) {
        throw new Error("The mock mailbox only stores send claims.");
      }
      const onlyIf = options.onlyIf || {};
      const current = records.get(key);
      if (onlyIf.etagDoesNotMatch === "*" && current) return null;
      if (onlyIf.etagMatches && (!current || current.etag !== onlyIf.etagMatches)) return null;
      const etag = "mock-etag-" + (++seq);
      const body = typeof value === "string" ? value : new TextDecoder().decode(value);
      records.set(key, { etag, body });
      return { key, etag, httpEtag: etag };
    },
    async delete() {
      throw new Error("The mock mailbox does not delete messages.");
    },
  };
}

const env = {
  MAIL: bucket(),
  BUCKET_NAME: "mock-mail",
  MAIL_FROM: "you@example.com",
  MAIL_FROM_NAME: "Example Inbox",
  MAIL_REPLY_TO: "you@example.com",
  MAIL_OWN_ADDRESSES: "me@example.net",
  EMAIL_ACCOUNT_ID: ACCOUNT,
  EMAIL_API_TOKEN: "mock-email-token",
  EMAIL_ZONE_ID: ACCOUNT,
  EMAIL_ACTIVITY_LOG_BASE: `https://dash.cloudflare.com/${ACCOUNT}/email-service/sending/${ACCOUNT}/${ACCOUNT}/activity-log`,
  EMAIL_ANALYTICS_TOKEN: "mock-analytics-token",
  async EMAIL_ANALYTICS_FETCH(url, init) {
    if (!String(url).endsWith("/graphql")) throw new Error("The mock mailbox blocked a non-analytics request.");
    const query = JSON.parse(init.body).query || "";
    if (/emailRoutingAdaptive/.test(query)) throw new Error("The mock mailbox does not serve routing activity as sent mail.");
    return new Response(JSON.stringify({
      data: { viewer: { zones: [{ emailSendingAdaptive: [
        {
          datetime: "2026-11-09T18:00:00Z",
          from: "Example Inbox <you@example.com>",
          to: "ada@example.com",
          envelopeTo: "ada@example.com",
          subject: "Hello from the inbox",
          status: "sent",
          messageId: "<mock-message@example.com>",
          spf: "pass",
          dkim: "pass",
          dmarc: "pass",
        },
        {
          datetime: "2026-11-09T18:05:00Z",
          from: "Example Inbox <you@example.com>",
          to: "ada@example.com",
          subject: "Hello from the inbox",
          status: "delivered",
          messageId: "<mock-message@example.com>",
        },
      ] }] } },
    }), { status: 200, headers: { "content-type": "application/json" } });
  },
  async EMAIL_FETCH(url, init) {
    if (!String(url).endsWith("/email/sending/send")) {
      throw new Error("The mock mailbox blocked a request that is not Email Sending.");
    }
    const body = JSON.parse(init.body);
    const subject = String(body.subject || "");
    console.log(`mock send accepted recipients=${count(body)} bcc=${Array.isArray(body.bcc) ? body.bcc.length : body.bcc ? 1 : 0}`);
    if (/mock reject/i.test(subject)) {
      return new Response(JSON.stringify({
        success: false,
        errors: [{ code: 7000, message: "Sender domain is not verified" }],
      }), { status: 400, headers: { "content-type": "application/json" } });
    }
    const queued = []
      .concat(body.to || [], body.cc || [], body.bcc || [])
      .map((item) => (typeof item === "string" ? item : item.address))
      .filter(Boolean);
    return new Response(JSON.stringify({
      success: true,
      errors: [],
      result: {
        delivered: [],
        queued,
        permanent_bounces: [],
        message_id: "<mock-message@example.com>",
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  },
};

function count(body) {
  return ["to", "cc", "bcc"].reduce((sum, field) => sum + (Array.isArray(body[field]) ? body[field].length : body[field] ? 1 : 0), 0);
}

const port = Number(process.env.PORT || 4173);
const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `127.0.0.1:${port}`;
    const url = new URL(req.url || "/", `http://${host}`);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) for (const item of value) headers.append(key, item);
      else if (value != null) headers.set(key, value);
    }
    const request = new Request(url, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    const response = await worker.fetch(request, env);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key === "content-encoding") return;
      res.setHeader(key, value);
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.statusCode = 500;
    res.end(error instanceof Error ? error.message : "Mock inbox failed.");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock inbox http://127.0.0.1:${port}`);
  console.log("sends stay inside this process and are reported as queued");
});
