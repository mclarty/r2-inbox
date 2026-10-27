// r2-inbox email worker (Cloudflare Email Routing -> Worker -> private R2).
//
// For every inbound email:
//  1. Archive the raw MIME to the private R2 bucket (binding INBOUND) at
//     inbound/YYYY/MM/DD/<UTC timestamp>-<sha256(Message-ID)[:16]>.eml with small custom metadata.
//     If the archive write fails the worker throws so the sender gets a bounce, not silent loss.
//  2. Drop mail whose envelope recipient does not match ACCEPT_RECIPIENTS (archived + dropped/ record).
//  3. Check the drop list (R2 config/droplist.json, cached for DROPLIST_TTL_MS). A match is archived,
//     logged under dropped/, and optionally refused at SMTP time (REJECT_DROPPED="true").
//  4. POST a small JSON notification to NOTIFY_URL (optional secret; NOTIFY_AUTH is sent as the
//     Authorization header). Transient failures are retried; a final failure is recorded under failed/.
// The webhook payload carries auth_verdict (pass/fail/none), dkim_domain, spf_result, dmarc_result and
// self_spoof_suspect, computed only from Cloudflare's own (topmost) Authentication-Results header.
// There is no forwarding: consumers read the original from R2 using the key in the payload.
//
// Environment (all optional; see r2-inbox.config.example.json / README):
//   ACCEPT_RECIPIENTS  comma list of patterns: "you@example.com", "you+*@example.com", "*@sub.example.com".
//                      Empty = accept every recipient routed to this worker.
//   SELF_DOMAINS       comma list of your own domains (spoof detection; authenticated self mail is never dropped).
//   NEVER_DROP         comma list of extra domains that are never dropped.
//   REJECT_DROPPED     "true" to refuse drop-listed senders with SMTP 550 5.7.1.

const META_MAX = 400; // R2 custom metadata total limit is 2 KB
export const DROPLIST_KEY = "config/droplist.json";
export const DROPLIST_TTL_MS = 5 * 60 * 1000;
// Droplisted senders are rejected at SMTP time (5xx) when env.REJECT_DROPPED === "true"
// and config/droplist.json does not set "reject_dropped": false. Recipient drops are never rejected.
export const REJECT_REASON = "550 5.7.1 Message rejected: sender not accepted by recipient";
export function shouldReject(env, list) {
  return String(env && env.REJECT_DROPPED || "").toLowerCase() === "true" && !!list && list.rejectDropped !== false;
}
// Self domains: the never-drop exemption for these applies ONLY when the header From is
// authenticated and aligned (auth_verdict=pass). Unauthenticated self-domain mail is still
// stored and delivered, but flagged self_spoof_suspect=true. Subdomains are included.
let SELF_DOMAINS = [];
let NEVER_DROP = [];
let RECIPIENTS = null; // null = accept all

function csv(v) {
  return String(v || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
}
function globRe(pattern) {
  // A bare "*" local part ("*@sub.example.com") must match at least one character.
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/^\*@/, "\u0000@").replace(/\*/g, "[^@]*").replace("\u0000", "[^@]+");
  return new RegExp("^" + esc + "$");
}
// Apply worker env vars to module settings. Called on every email (cheap) and by tests.
export function configure(env = {}) {
  SELF_DOMAINS = csv(env.SELF_DOMAINS);
  NEVER_DROP = csv(env.NEVER_DROP);
  const pats = csv(env.ACCEPT_RECIPIENTS);
  RECIPIENTS = pats.length ? pats.map(globRe) : null;
  return { selfDomains: [...SELF_DOMAINS], neverDrop: [...NEVER_DROP], recipients: pats };
}
// Cloudflare Email Routing prepends its own Authentication-Results header; it is the first
// one in the raw message. Anything below it came from the sender and is not trusted.
const TRUSTED_AUTHSERV = "mx.cloudflare.net";
const HDR_SCAN_MAX = 65536;

function clip(s) {
  s = String(s ?? "").replace(/[\r\n]+/g, " ").trim();
  return s.length > META_MAX ? s.slice(0, META_MAX) : s;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildKey(messageId, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const ts = now.toISOString().replace(/[-:.]/g, ""); // e.g. 20261013T194500123Z
  const id = (messageId || "").trim().replace(/^<|>$/g, "") || `no-id-${crypto.randomUUID()}`;
  const hash = (await sha256Hex(id)).slice(0, 16);
  return `inbound/${y}/${m}/${d}/${ts}-${hash}.eml`;
}

// "Name <a@b.com>" / "a@b.com" / "<a@b.com>" -> "a@b.com" (lowercased), or "".
export function extractAddress(from) {
  const s = String(from ?? "");
  const m = s.match(/<([^<>\s]+@[^<>\s]+)>/) || s.match(/([^\s<>"',;:()]+@[^\s<>"',;:()]+)/);
  return m ? m[1].trim().toLowerCase().replace(/\.$/, "") : "";
}

function underDomain(dom, base) {
  return dom === base || dom.endsWith("." + base);
}

export function isSelfDomain(dom) {
  dom = String(dom || "").toLowerCase();
  return !!dom && SELF_DOMAINS.some((b) => underDomain(dom, b));
}

// ---- authentication verdict (from Cloudflare's own Authentication-Results) ----
const TWO_LEVEL = new Set(["co", "com", "net", "org", "ac", "gov", "edu", "ne", "or", "go"]);
export function orgDomain(dom) {
  const l = String(dom || "").toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (l.length <= 2) return l.join(".");
  const n = l[l.length - 1].length === 2 && TWO_LEVEL.has(l[l.length - 2]) ? 3 : 2;
  return l.slice(-n).join(".");
}
function aligned(d, fromDom) { return !!d && !!fromDom && orgDomain(d) === orgDomain(fromDom); }

// Raw header section -> [[lowercased name, unfolded value], ...] in order (top first).
export function rawHeaders(buf) {
  const bytes = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer || buf);
  const sub = bytes.subarray(0, Math.min(bytes.length, HDR_SCAN_MAX));
  let txt = ""; // byte-wise (latin1) decode; avoids relying on non-UTF-8 TextDecoder support
  for (let i = 0; i < sub.length; i += 8192) txt += String.fromCharCode.apply(null, sub.subarray(i, i + 8192));
  const m = txt.match(/\r?\n\r?\n/);
  const head = m ? txt.slice(0, m.index) : txt;
  const out = [];
  for (const line of head.split(/\r?\n(?![ \t])/)) {
    const i = line.indexOf(":");
    if (i > 0) out.push([line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).replace(/\r?\n[ \t]+/g, " ").trim()]);
  }
  return out;
}

export function parseAuthResults(v) {
  let s = String(v || "");
  for (let k = 0; k < 5 && /\([^()]*\)/.test(s); k++) s = s.replace(/\([^()]*\)/g, " ");
  const segs = s.split(";").map((x) => x.trim()).filter(Boolean);
  const authserv = (segs.shift() || "").split(/\s+/)[0].toLowerCase();
  const res = [];
  for (const seg of segs) {
    const toks = seg.split(/\s+/);
    const mr = (toks.shift() || "").match(/^([a-z0-9_-]+)=([a-z0-9_-]+)$/i);
    if (!mr) continue;
    const props = {};
    for (const t of toks) { const j = t.indexOf("="); if (j > 0) props[t.slice(0, j).toLowerCase()] = t.slice(j + 1).replace(/^"|"$/g, ""); }
    res.push({ method: mr[1].toLowerCase(), result: mr[2].toLowerCase(), props });
  }
  return { authserv, res };
}

// Returns {auth_verdict, dkim_domain, spf_result, dmarc_result, from_domain, self_spoof_suspect}.
export function authVerdict(headers) {
  const fromHdrs = headers.filter(([n]) => n === "from");
  const fromDom = (extractAddress(fromHdrs[0] ? fromHdrs[0][1] : "").split("@")[1] || "");
  const ar = headers.find(([n]) => n === "authentication-results");
  const out = { auth_verdict: "none", dkim_domain: "", spf_result: "", dmarc_result: "", from_domain: fromDom };
  const parsed = ar ? parseAuthResults(ar[1]) : null;
  if (parsed && parsed.authserv === TRUSTED_AUTHSERV) {
    const dk = parsed.res.filter((r) => r.method === "dkim");
    const spfs = parsed.res.filter((r) => r.method === "spf");
    const spf = spfs.find((r) => r.props["smtp.mailfrom"]) || spfs[0];
    const dm = parsed.res.find((r) => r.method === "dmarc");
    const dkPassAligned = dk.find((r) => r.result === "pass" && aligned(r.props["header.d"], fromDom));
    const dkShow = dkPassAligned || dk.find((r) => r.result === "pass") || dk[0];
    out.dkim_domain = clip((dkShow && dkShow.props["header.d"]) || "").toLowerCase().slice(0, 100);
    out.spf_result = spf ? spf.result.slice(0, 20) : "";
    out.dmarc_result = dm ? dm.result.slice(0, 20) : "";
    const mf = spf ? String(spf.props["smtp.mailfrom"] || "") : "";
    const mfDom = (mf.includes("@") ? mf.split("@").pop() : mf).toLowerCase();
    const dmPass = dm && dm.result === "pass" && String(dm.props["header.from"] || "").toLowerCase() === fromDom;
    const spfPass = spf && spf.result === "pass" && aligned(mfDom, fromDom);
    // Several From headers is a classic display/alignment trick: never pass it.
    out.auth_verdict = fromDom && fromHdrs.length === 1 && (dkPassAligned || spfPass || dmPass) ? "pass" : "fail";
  }
  const anySelf = fromHdrs.some(([, val]) => isSelfDomain(extractAddress(val).split("@")[1]));
  out.self_spoof_suspect = (isSelfDomain(fromDom) || anySelf) && out.auth_verdict !== "pass";
  return out;
}

// Compile the R2 JSON into fast lookups. Throws on a malformed document (caller fails open).
export function compileDropList(doc) {
  if (!doc || typeof doc !== "object" || !doc.drop || typeof doc.drop !== "object") throw new Error("droplist: missing drop");
  const lc = (x) => String(x).trim().toLowerCase();
  const senders = new Map();
  for (const e of doc.drop.senders || []) if (e && e.address) senders.set(lc(e.address), e);
  const domains = new Map(); // domain -> {drop:boolean, rule}
  for (const d of (doc.allow && doc.allow.domains) || []) domains.set(lc(d), { drop: false });
  for (const e of doc.drop.domains || []) if (e && e.domain) domains.set(lc(e.domain), { drop: true, sub: e.subdomains !== false, e });
  const subjects = [];
  for (const e of doc.drop.subjects || []) {
    if (!e || !e.pattern) continue;
    let flags = String(e.flags ?? "i").replace(/[^imsu]/g, "");
    if (!flags.includes("i")) flags += "i";
    try { subjects.push({ re: new RegExp(String(e.pattern).replace(/^\(\?i\)/, ""), flags), e }); }
    catch (err) { console.error("droplist: bad subject pattern skipped", e.pattern); }
  }
  return {
    senders, domains, subjects,
    allowSenders: new Set(((doc.allow && doc.allow.senders) || []).map(lc)),
    neverDrop: [...SELF_DOMAINS, ...NEVER_DROP, ...((doc.never_drop || []).map(lc))],
    // Kill switch without a redeploy: "reject_dropped": false in config/droplist.json.
    rejectDropped: doc.reject_dropped !== false,
  };
}

// Returns a short rule string (e.g. "sender:x@y.com") or null.
// selfAuth: true only when the header From is a self domain AND auth_verdict is pass.
// Self-domain never-drop entries (built-in or from R2) are honoured only then.
export function matchDrop(list, fromHeader, subject, envelopeFrom, selfAuth = false) {
  if (!list) return null;
  const addr = extractAddress(fromHeader) || extractAddress(envelopeFrom);
  const envAddr = extractAddress(envelopeFrom);
  for (const a of [addr, envAddr]) {
    const dom = a.split("@")[1] || "";
    if (!dom) continue;
    if (isSelfDomain(dom)) { if (selfAuth && a === addr) return null; continue; }
    if (list.neverDrop.some((n) => !isSelfDomain(n) && underDomain(dom, n))) return null;
  }
  if (addr && !list.allowSenders.has(addr)) {
    if (list.senders.has(addr)) return `sender:${addr}`;
    // Longest-suffix wins between junk domains and non-junk (allow) domain rulings.
    const labels = (addr.split("@")[1] || "").split(".");
    for (let i = 0; i < labels.length - 1; i++) {
      const cand = labels.slice(i).join(".");
      const r = list.domains.get(cand);
      if (!r) continue;
      if (r.drop && (i === 0 || r.sub)) return `domain:${cand}`;
      break; // most specific ruling is non-junk (or exact-only) -> no domain drop
    }
  }
  const subj = String(subject ?? "");
  if (subj) for (const s of list.subjects) if (s.re.test(subj)) return `subject:${s.e.pattern}`;
  return null;
}

export const DEFAULT_RETRY_DELAYS_MS = [0, 5000, 15000, 30000, 60000];
// NOTIFY_RETRY_DELAYS_MS: optional comma list of waits before each attempt, e.g. "0,5000,15000".
export function retryDelays(env) {
  const raw = String((env && env.NOTIFY_RETRY_DELAYS_MS) || "").trim();
  if (!raw) return DEFAULT_RETRY_DELAYS_MS;
  const v = raw.split(",").map((x) => Number.parseInt(x, 10)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 120000);
  return v.length ? v.slice(0, 10) : DEFAULT_RETRY_DELAYS_MS;
}

let cache = { at: 0, list: null };
export function _resetDropListCache() { cache = { at: 0, list: null }; }

// Returns compiled list, or null on any failure (fail open). Failures are cached briefly too
// so a broken list doesn't cost an R2 read per message.
export async function loadDropList(env, now = Date.now()) {
  if (cache.at && now - cache.at < DROPLIST_TTL_MS) return cache.list;
  let list = null;
  try {
    const obj = await env.INBOUND.get(DROPLIST_KEY);
    if (obj) list = compileDropList(JSON.parse(await obj.text()));
    else console.error("droplist: not found");
  } catch (err) {
    console.error("droplist load failed", err && err.stack || err);
    list = null;
  }
  cache = { at: now, list };
  return list;
}

// Recipient filter from ACCEPT_RECIPIENTS. Everything else is archived and dropped.
export function wantedRecipient(addr) {
  const a = String(addr || "").trim().toLowerCase().replace(/^<|>$/g, "");
  if (!a || !a.includes("@")) return false;
  return RECIPIENTS === null || RECIPIENTS.some((re) => re.test(a));
}

export default {
  async email(message, env, ctx) {
    configure(env);
    const h = message.headers;
    const meta = {
      from: clip(h.get("from") || message.from),
      to: clip(h.get("to") || message.to),
      subject: clip(h.get("subject")),
      date: clip(h.get("date") || new Date().toUTCString()),
      envelopeFrom: clip(message.from),
      envelopeTo: clip(message.to),
      messageId: clip(h.get("message-id")),
    };

    let key = null;
    let auth = { auth_verdict: "none", dkim_domain: "", spf_result: "", dmarc_result: "", from_domain: "", self_spoof_suspect: false };
    try {
      key = await buildKey(h.get("message-id"));
      const raw = await new Response(message.raw).arrayBuffer();
      try { auth = authVerdict(rawHeaders(raw)); }
      catch (err) { console.error("auth parse failed", err && err.stack || err);
        auth.self_spoof_suspect = isSelfDomain(extractAddress(h.get("from") || message.from).split("@")[1]); }
      const cm = { ...meta, auth: clip(`${auth.auth_verdict} d=${auth.dkim_domain} spf=${auth.spf_result} dmarc=${auth.dmarc_result}${auth.self_spoof_suspect ? " SPOOF" : ""}`).slice(0, 120) };
      if (JSON.stringify(cm).length > 1900) delete cm.auth; // R2 custom metadata limit is 2 KB
      await env.INBOUND.put(key, raw, {
        httpMetadata: { contentType: "message/rfc822" },
        customMetadata: cm,
      });
    } catch (err) {
      console.error("r2 archive failed", key, err && err.stack || err);
      key = null;
    }

    // Recipient check (ACCEPT_RECIPIENTS).
    if (key && !wantedRecipient(message.to)) {
      const logKey = "dropped/" + key.slice("inbound/".length).replace(/\.eml$/, ".json");
      try {
        await env.INBOUND.put(logKey, JSON.stringify({ dropped: "recipient", to: meta.envelopeTo, key,
          from: meta.from, subject: meta.subject, date: meta.date, messageId: meta.messageId, at: new Date().toISOString() }), {
          httpMetadata: { contentType: "application/json" },
          customMetadata: { dropped: "recipient", key },
        });
      } catch (err) {
        console.error("dropped log failed", logKey, err && err.stack || err);
      }
      console.log("dropped recipient", meta.envelopeTo, key);
      return;
    }

    // Drop check: only when the archive copy exists (so nothing is lost). On any error the mail is not dropped.
    if (key) {
      let rule = null, list = null;
      try {
        list = await loadDropList(env);
        rule = matchDrop(list, h.get("from") || message.from, h.get("subject"), message.from,
          auth.auth_verdict === "pass" && !auth.self_spoof_suspect && isSelfDomain(auth.from_domain));
      } catch (err) {
        console.error("droplist match failed", err && err.stack || err);
        rule = null;
      }
      if (rule) {
        const logKey = "dropped/" + key.slice("inbound/".length).replace(/\.eml$/, ".json");
        const rec = { dropped: clip(rule), key, from: meta.from, subject: meta.subject, date: meta.date,
          messageId: meta.messageId, at: new Date().toISOString() };
        const reject = shouldReject(env, list);
        if (reject) rec.rejected = REJECT_REASON;
        try {
          await env.INBOUND.put(logKey, JSON.stringify(rec), {
            httpMetadata: { contentType: "application/json" },
            customMetadata: { dropped: clip(rule), key },
          });
        } catch (err) {
          console.error("dropped log failed", logKey, err && err.stack || err);
        }
        if (reject) {
          // Raw MIME is already in R2 (inbound/<key>) and the dropped/ record is written, so
          // tooling can still read List-Unsubscribe etc. Now refuse at SMTP time.
          console.log("rejected", rule, key);
          message.setReject(REJECT_REASON);
          return;
        }
        console.log("dropped", rule, key);
        return;
      }
    }

    // No archive copy means we can't hand the mail off safely: throw so the sender gets a
    // delivery failure instead of the message vanishing.
    if (!key) throw new Error("r2 archive failed; message not stored");

    // Webhook-only delivery: notify the consumer, which pulls the original from R2. There is no
    // forwarding. If the webhook fails, log it under failed/ so it can be swept and replayed.
    let reason = "notify_unset", error = "";
    if (env.NOTIFY_URL) {
      try {
        const headers = { "content-type": "application/json" };
        if (env.NOTIFY_AUTH) headers["authorization"] = env.NOTIFY_AUTH;
        const body = JSON.stringify({ key, from: meta.from, subject: meta.subject, date: meta.date, messageId: meta.messageId,
          auth_verdict: auth.auth_verdict, dkim_domain: auth.dkim_domain, spf_result: auth.spf_result,
          dmarc_result: auth.dmarc_result, self_spoof_suspect: auth.self_spoof_suspect });
        // Webhook receivers may intermittently answers 400 (and could answer 409/429/5xx) when it is
        // busy with an in-flight run. Retry transient statuses with backoff before giving up.
        const delays = retryDelays(env);
        for (let i = 0; i < delays.length; i++) {
          if (delays[i]) await new Promise((res) => setTimeout(res, delays[i]));
          try {
            const r = await fetch(env.NOTIFY_URL, { method: "POST", headers, body });
            if (r.ok) { console.log("notified", key, "attempt", i + 1); return; }
            reason = "notify_status"; error = String(r.status);
            try { const t = (await r.text()).slice(0, 300); if (t) error += " " + t; } catch {}
            console.warn("notify attempt failed", i + 1, error, key);
            if (![400, 408, 409, 425, 429, 500, 502, 503, 504].includes(r.status)) break;
          } catch (err) {
            reason = "notify_failed"; error = String(err && err.message || err);
            console.warn("notify attempt threw", i + 1, error, key);
          }
        }
      } catch (err) {
        reason = "notify_failed"; error = String(err && err.message || err);
      }
    }
    console.error("webhook not delivered", reason, error, key);
    const failKey = "failed/" + key.slice("inbound/".length).replace(/\.eml$/, ".json");
    try {
      await env.INBOUND.put(failKey, JSON.stringify({ reason, error, key, from: meta.from,
        subject: meta.subject, date: meta.date, messageId: meta.messageId, auth_verdict: auth.auth_verdict,
        dkim_domain: auth.dkim_domain, spf_result: auth.spf_result, dmarc_result: auth.dmarc_result,
        self_spoof_suspect: auth.self_spoof_suspect, at: new Date().toISOString() }), {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { reason, key },
      });
    } catch (writeErr) {
      console.error("failed log write failed", failKey, writeErr && writeErr.stack || writeErr);
    }
  },
};
