// Outbound message construction. The sender address always comes from worker
// configuration; nothing in here trusts a client-supplied From. Bcc is carried
// only as a provider envelope field and is never copied into headers, quoted
// text, or reply drafts.
import { Parser } from "htmlparser2";
import { escapeText, OUTGOING_DROP_TAGS, sanitizeHtml } from "./sanitize.js";
import { httpError } from "./status.js";

export const MAX_RECIPIENTS = 50;
export const MAX_SUBJECT = 998;
export const MAX_HTML_CHARS = 200_000;
const MAX_HEADER_VALUE = 1800;

const EMAIL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const MESSAGE_ID_RE = /^<[^<>\s]{1,500}>$/;
const BLOCK_BREAK = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "tr", "li", "blockquote", "ul", "ol"]);

export function oneLine(value) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/[ \t\f\v]+/g, " ").trim();
}

export function parseRecipient(raw) {
  const original = String(raw ?? "");
  if (/[\u0000-\u001F\u007F]/.test(original)) {
    throw httpError(400, "That address contains a line break or control character.");
  }
  const value = oneLine(original);
  if (!value) throw httpError(400, "Enter an email address.");
  if (value.length > 320) throw httpError(400, "That address is too long.");
  let name = "";
  let email = value;
  const named = /^(?:"([^"]*)"|([^<]*?))\s*<([^<>]+)>$/.exec(value);
  if (named) {
    name = oneLine(named[1] ?? named[2] ?? "").replace(/[<>"]/g, "").trim();
    email = oneLine(named[3]);
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw httpError(400, `"${email.slice(0, 80)}" is not a valid email address.`);
  }
  return { email, name: name.slice(0, 80) };
}

export function parseRecipientList(value, label) {
  if (value == null || value === "") return [];
  const items = Array.isArray(value) ? value : [value];
  const people = [];
  for (const item of items) {
    if (typeof item === "string") {
      for (const part of item.split(/[,\n;]+/)) {
        if (oneLine(part)) people.push(parseRecipient(part));
      }
      continue;
    }
    if (item && typeof item === "object") {
      const email = item.email || item.address || "";
      const name = item.name || "";
      people.push(parseRecipient(name ? `"${oneLine(name)}" <${email}>` : email));
      continue;
    }
    throw httpError(400, `${label} contains an address this inbox cannot use.`);
  }
  return people;
}

function addressKey(email) {
  return String(email || "").trim().toLowerCase();
}

export function dedupeRecipients(people) {
  const out = [];
  const seen = new Set();
  for (const person of people) {
    const key = addressKey(person.email);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ email: person.email, name: person.name || "" });
  }
  return out;
}

// A configured mailbox covers its plus-addresses (you@example.com also matches
// you+list@example.com). An explicit plus-alias matches only itself.
export function isOwnIdentity(email, own) {
  const key = addressKey(email);
  const at = key.lastIndexOf("@");
  if (at <= 0) return false;
  const local = key.slice(0, at);
  const domain = key.slice(at + 1);
  const base = local.split("+")[0];
  for (const item of own || []) {
    const other = addressKey(item);
    const otherAt = other.lastIndexOf("@");
    if (otherAt <= 0) continue;
    if (other === key) return true;
    const olocal = other.slice(0, otherAt);
    const odomain = other.slice(otherAt + 1);
    if (odomain !== domain || olocal.includes("+")) continue;
    if (olocal === base) return true;
  }
  return false;
}

export function collectOwnAddresses(env, accessEmail) {
  const raw = [env && env.MAIL_FROM, env && env.MAIL_REPLY_TO, env && env.MAIL_OWN_ADDRESSES, accessEmail];
  const own = [];
  for (const item of raw) {
    for (const part of String(item || "").split(",")) {
      const value = oneLine(part);
      if (value && EMAIL_RE.test(value)) own.push(value);
    }
  }
  return dedupeRecipients(own.map((email) => ({ email, name: "" }))).map((person) => person.email);
}

export function sanitizeOutgoingHtml(html) {
  return sanitizeHtml(String(html || ""), {}, false, OUTGOING_DROP_TAGS);
}

export function htmlToPlain(html) {
  const src = sanitizeOutgoingHtml(html);
  const lines = [""];
  const quotes = [];
  const lists = [];
  let href = null;
  let anchor = "";

  const current = () => lines[lines.length - 1];
  const prefix = () => (quotes.length ? "> ".repeat(quotes.length) : "");
  const breakLine = (blank = false) => {
    lines[lines.length - 1] = current().replace(/[ \t]+$/g, "");
    if (current() !== prefix()) lines.push(prefix());
    if (blank && (lines.length < 2 || lines[lines.length - 2] !== prefix())) lines.push(prefix());
  };
  const write = (text) => {
    const chunk = String(text).replace(/\s+/g, " ");
    if (!chunk || !chunk.trim()) return;
    let line = current();
    const lead = prefix();
    if (lead && !line.startsWith(lead)) line = lead + line;
    const body = line.slice(lead.length);
    const piece = chunk.trim();
    if (body.length && !body.endsWith(" ")) line += " ";
    lines[lines.length - 1] = line + piece;
    if (href !== null) anchor += piece;
  };

  const parser = new Parser({
    onopentag(tag, attrs) {
      tag = tag.toLowerCase();
      if (tag === "br") {
        breakLine();
        return;
      }
      if (tag === "blockquote") {
        breakLine();
        quotes.push(1);
        if (!current().startsWith(prefix())) lines[lines.length - 1] = prefix();
        return;
      }
      if (tag === "ul" || tag === "ol") {
        lists.push({ type: tag, n: 1 });
        breakLine();
        return;
      }
      if (tag === "li") {
        breakLine();
        const list = lists[lists.length - 1];
        write(list && list.type === "ol" ? `${list.n++}. ` : "- ");
        return;
      }
      if (tag === "a") {
        href = attrs.href || "";
        anchor = "";
        return;
      }
      if (BLOCK_BREAK.has(tag)) breakLine();
    },
    ontext(data) {
      write(data);
    },
    onclosetag(tag) {
      tag = tag.toLowerCase();
      if (tag === "a") {
        const link = oneLine(href);
        if (link && /^(https?:\/\/|mailto:)/i.test(link) && !anchor.includes(link)) write(`(${link})`);
        href = null;
        anchor = "";
      }
      if (tag === "blockquote") {
        breakLine(true);
        quotes.pop();
        lines[lines.length - 1] = prefix();
      } else if (tag === "ul" || tag === "ol") {
        lists.pop();
        breakLine();
      } else if (tag === "p" || tag === "div" || tag === "pre" || /^h[1-6]$/.test(tag)) {
        breakLine(true);
      } else if (BLOCK_BREAK.has(tag)) {
        breakLine();
      }
    },
  }, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
  parser.write(src);
  parser.end();
  return lines.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function plainToHtml(text) {
  const parts = String(text || "").replace(/\r\n/g, "\n").split(/\n{2,}/);
  const blocks = parts.filter((part) => part.trim()).map((part) => {
    return `<p>${escapeText(part).replace(/\n/g, "<br>")}</p>`;
  });
  return blocks.join("") || "<p></p>";
}

function messageIds(value) {
  return [...String(value || "").matchAll(/<[^<>\r\n\t]+>/g)].map((match) => match[0]).filter((id) => MESSAGE_ID_RE.test(id));
}

export function threadingFromHeaders(headers) {
  const list = Array.isArray(headers) ? headers : [];
  const values = (name) => list.filter((header) => String(header.name || "").toLowerCase() === name).map((header) => header.value);
  const messageId = messageIds(values("message-id").join(" "))[0] || "";
  const references = [];
  for (const value of values("references")) {
    for (const id of messageIds(value)) {
      if (!references.includes(id)) references.push(id);
    }
  }
  let trimmed = false;
  if (messageId && !references.includes(messageId)) references.push(messageId);
  while (references.join(" ").length > MAX_HEADER_VALUE && references.length > 1) {
    references.shift();
    trimmed = true;
  }
  return { messageId, references, trimmed };
}

export function withSubjectPrefix(subject, prefix) {
  const pattern = prefix === "Re" ? /^(?:re)\s*:\s*/i : /^(?:fwd|fw)\s*:\s*/i;
  let rest = oneLine(subject);
  while (pattern.test(rest)) rest = rest.replace(pattern, "").trim();
  if (!rest) rest = "(No subject)";
  const next = `${prefix}: ${rest}`;
  return next.length > MAX_SUBJECT ? next.slice(0, MAX_SUBJECT).trim() : next;
}

function formatPerson(person) {
  if (!person) return "";
  const email = oneLine(person.email || "");
  const name = oneLine(person.name || "").replace(/[<>"]/g, "");
  if (name && email) return `${name} <${email}>`;
  return name || email;
}

function validPeople(list) {
  const people = [];
  for (const person of list || []) {
    const email = person && (person.email || person.address) || "";
    if (!email) continue;
    try {
      people.push(parseRecipient(person.name ? `"${oneLine(person.name)}" <${email}>` : email));
    } catch {
      // Drop addresses that cannot be replied to instead of inventing one.
    }
  }
  return people;
}

function excludeOwn(people, own) {
  return dedupeRecipients(people).filter((person) => !isOwnIdentity(person.email, own));
}

export function replyRecipients(view, own, all) {
  const replyTo = validPeople(view.reply_to || view.replyTo);
  const from = validPeople(view.from_email ? [{ name: view.from_name, email: view.from_email }] : []);
  const warnings = [];
  let targets = replyTo;
  if (!targets.length) {
    if ((view.reply_to || view.replyTo || []).length) warnings.push("The Reply-To address was not usable, so the reply is addressed to From.");
    targets = from;
  }
  const primary = excludeOwn(targets, own);
  if (!all) {
    if (!primary.length) warnings.push("There is no usable reply address. Add a recipient before sending.");
    return { to: primary, cc: [], bcc: [], warnings };
  }
  const others = excludeOwn([...validPeople(view.to), ...validPeople(view.cc)], own);
  const seen = new Set(primary.map((person) => addressKey(person.email)));
  const cc = [];
  for (const person of others) {
    const key = addressKey(person.email);
    if (seen.has(key)) continue;
    seen.add(key);
    cc.push(person);
  }
  if (!primary.length && !cc.length) warnings.push("There is no one left to reply to after excluding your own addresses.");
  return { to: primary, cc, bcc: [], warnings };
}

function quotedHtml(view) {
  if (view.html) return sanitizeOutgoingHtml(view.html);
  return `<pre>${escapeText(view.text || "")}</pre>`;
}

function originalDate(view) {
  const header = (view.headers || []).find((item) => String(item.name || "").toLowerCase() === "date");
  return oneLine((header && header.value) || view.date || view.received || "");
}

function attribution(view) {
  const who = formatPerson({ name: view.from_name, email: view.from_email }) || "the sender";
  const when = originalDate(view);
  return when ? `On ${when}, ${who} wrote:` : `${who} wrote:`;
}

function forwardedHeading(view) {
  const rows = ["---------- Forwarded message ----------"];
  const from = formatPerson({ name: view.from_name, email: view.from_email });
  if (from) rows.push(`From: ${from}`);
  const when = originalDate(view);
  if (when) rows.push(`Date: ${when}`);
  rows.push(`Subject: ${oneLine(view.subject) || "(No subject)"}`);
  const to = validPeople(view.to).map(formatPerson).filter(Boolean).join(", ");
  const cc = validPeople(view.cc).map(formatPerson).filter(Boolean).join(", ");
  if (to) rows.push(`To: ${to}`);
  if (cc) rows.push(`Cc: ${cc}`);
  return rows;
}

export const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;

function fileDescriptors(view) {
  return (view.parts || []).filter((part) => part && !part.inline).map((part, index) => ({
    index: Number.isInteger(part.index) ? part.index : index,
    filename: part.filename || `attachment-${index + 1}`,
    size: part.size || 0,
    contentType: part.contentType || "application/octet-stream",
  }));
}

function attachmentNote(view, mode) {
  const files = fileDescriptors(view);
  if (!files.length && !view.has_attachments) return "";
  const names = files.map((file) => file.filename).join(", ");
  if (mode === "forward") {
    return names
      ? `Original files are included until you remove them: ${names}.`
      : "Original files are included until you remove them.";
  }
  return names
    ? `Original files are not attached: ${names}. Add a file if you want to send one.`
    : "Original files are not attached. Add a file if you want to send one.";
}

export function buildDraft(view, mode, own) {
  const kind = mode === "forward" ? "forward" : mode === "reply-all" ? "reply-all" : mode === "reply" ? "reply" : "";
  if (!kind) throw httpError(400, "Choose reply, reply-all, or forward.");
  const thread = threadingFromHeaders(view.headers);
  const warnings = [];
  if (thread.trimmed) warnings.push("Older thread references were shortened to fit the sending provider's header limit.");
  if (!thread.messageId) warnings.push("This message has no Message-ID, so threading headers were left off.");
  const files = fileDescriptors(view);
  const note = attachmentNote(view, kind);
  if (note) warnings.push(note);
  const quote = quotedHtml(view);
  if (kind === "forward") {
    const heading = forwardedHeading(view);
    const html = `<p><br></p><blockquote><p>${heading.map((row) => escapeText(row)).join("<br>")}</p>${quote}</blockquote>`;
    return {
      mode: kind,
      to: [],
      cc: [],
      bcc: [],
      subject: withSubjectPrefix(view.subject, "Fwd"),
      html,
      inReplyTo: "",
      references: thread.messageId ? thread.references : [],
      attachments: files,
      warnings,
    };
  }
  const recipients = replyRecipients(view, own, kind === "reply-all");
  const line = attribution(view);
  const html = `<p><br></p><p>${escapeText(line)}</p><blockquote>${quote}</blockquote>`;
  return {
    mode: kind,
    to: recipients.to,
    cc: recipients.cc,
    bcc: [],
    subject: withSubjectPrefix(view.subject, "Re"),
    html,
    inReplyTo: thread.messageId,
    references: thread.messageId ? thread.references : [],
    attachments: [],
    warnings: [...warnings, ...recipients.warnings],
  };
}

function providerAddress(person) {
  const name = oneLine(person.name).replace(/[<>"]/g, "").trim();
  return name ? { address: person.email, name } : person.email;
}

function cleanIdList(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(/\s+/);
  const ids = [];
  for (const item of items) {
    const id = oneLine(item);
    if (!id) continue;
    if (!MESSAGE_ID_RE.test(id)) throw httpError(400, "A threading id is not a valid Message-ID.");
    if (!ids.includes(id)) ids.push(id);
  }
  while (ids.join(" ").length > MAX_HEADER_VALUE && ids.length > 1) ids.shift();
  return ids;
}

export function normalizeOutgoing(input, settings) {
  const body = input && typeof input === "object" && !Array.isArray(input) ? input : null;
  if (!body) throw httpError(400, "The message must be a JSON object.");
  const to = dedupeRecipients(parseRecipientList(body.to, "To"));
  const cc = dedupeRecipients(parseRecipientList(body.cc, "Cc"));
  const bcc = dedupeRecipients(parseRecipientList(body.bcc, "Bcc"));
  const seen = new Set();
  for (const person of [...to, ...cc, ...bcc]) {
    const key = addressKey(person.email);
    if (seen.has(key)) throw httpError(400, `${person.email} is listed more than once.`);
    seen.add(key);
  }
  if (!seen.size) throw httpError(400, "Add at least one recipient.");
  if (seen.size > MAX_RECIPIENTS) throw httpError(400, `A message can have at most ${MAX_RECIPIENTS} recipients.`);
  let subject = oneLine(body.subject);
  if (!subject) subject = "(no subject)";
  if (subject.length > MAX_SUBJECT) throw httpError(400, `The subject must be ${MAX_SUBJECT} characters or fewer.`);
  const htmlSource = typeof body.html === "string" ? body.html : "";
  const textSource = typeof body.text === "string" ? body.text : "";
  if (htmlSource.length > MAX_HTML_CHARS || textSource.length > MAX_HTML_CHARS) {
    throw httpError(413, "That message is too large.");
  }
  const html = htmlSource.trim() ? sanitizeOutgoingHtml(htmlSource) : plainToHtml(textSource);
  const text = (htmlSource.trim() ? htmlToPlain(html) : textSource.replace(/\r\n/g, "\n")).trim();
  if (!text) throw httpError(400, "Write a message before sending.");
  const inReplyTo = body.inReplyTo ? cleanIdList([body.inReplyTo])[0] || "" : "";
  const references = body.references ? cleanIdList(body.references) : [];
  if (inReplyTo && !references.includes(inReplyTo)) references.push(inReplyTo);
  const attachments = normalizeAttachments(body.attachments);
  const fromName = oneLine(settings.fromName).replace(/[<>"]/g, "").slice(0, 120);
  const payload = {
    from: fromName ? { address: settings.from, name: fromName } : settings.from,
    to: to.map(providerAddress),
    subject,
    html,
    text,
  };
  if (cc.length) payload.cc = cc.map(providerAddress);
  if (bcc.length) payload.bcc = bcc.map(providerAddress);
  if (settings.replyTo) payload.reply_to = settings.replyTo;
  const headers = {};
  if (inReplyTo) headers["In-Reply-To"] = inReplyTo;
  if (references.length) headers.References = references.join(" ");
  if (Object.keys(headers).length) payload.headers = headers;
  const messageBytes = utf8Size(subject) + utf8Size(html) + utf8Size(text) + attachments.reduce((sum, file) => sum + file.size, 0);
  if (messageBytes > MAX_MESSAGE_BYTES) {
    throw httpError(413, "That message is larger than the 25 MiB Email Sending limit, including attachments.");
  }
  if (attachments.length) {
    payload.attachments = attachments.map((file) => ({
      content: file.content,
      filename: file.filename,
      type: file.type,
      disposition: "attachment",
    }));
  }
  return {
    payload,
    summary: {
      to: to.map((person) => person.email),
      cc: cc.map((person) => person.email),
      bcc: bcc.map((person) => person.email),
      subject,
    },
  };
}

const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

function utf8Size(value) {
  return new TextEncoder().encode(String(value || "")).byteLength;
}

export function safeFilename(name) {
  const base = String(name || "").split(/[/\\]/).pop().replace(/[\u0000-\u001F\u007F]/g, "").replace(/[<>:"|?*]/g, "").trim();
  if (!base || base === "." || base === ".." || base.length > 180) {
    throw httpError(400, "That file name is not allowed.");
  }
  return base;
}

export function safeMime(type) {
  const value = String(type || "application/octet-stream").toLowerCase().split(";")[0].trim();
  if (!MIME_RE.test(value)) throw httpError(400, "That attachment type is not allowed.");
  return value;
}

export function decodeBase64(content) {
  const raw = String(content || "").replace(/\s/g, "");
  if (!raw || raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    throw httpError(400, "An attachment is not valid base64.");
  }
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, base64: raw };
}

export function attachmentFromBytes(filename, type, bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return {
    filename: safeFilename(filename),
    type: safeMime(type),
    content: btoa(binary),
    size: data.byteLength,
  };
}

function normalizeAttachments(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw httpError(400, "Attachments must be a list.");
  return value.map((item) => {
    if (!item || typeof item !== "object" || typeof item.content !== "string") {
      throw httpError(400, "An attachment is missing its contents.");
    }
    const decoded = decodeBase64(item.content);
    return {
      filename: safeFilename(item.filename),
      type: safeMime(item.type || item.contentType),
      content: decoded.base64,
      size: decoded.bytes.byteLength,
    };
  });
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  }
  return value;
}

export async function payloadHash(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(sortValue(payload)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function submissionId(value) {
  const id = String(value || "");
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(id)) {
    throw httpError(400, "The send request is missing a valid idempotency key.");
  }
  return id;
}

export function sendRecordKey(id) {
  return `outbound/sends/${id}.json`;
}

export function deliveryOutcome(result) {
  const list = (value) => (Array.isArray(value) ? value.map((item) => oneLine(item)).filter(Boolean) : []);
  const delivered = list(result && result.delivered);
  const queued = list(result && result.queued);
  const permanentBounces = list(result && result.permanent_bounces);
  const suppressed = list(result && (result.suppressed_recipients || result.suppressed));
  let outcome = "partial";
  if (delivered.length && !queued.length && !permanentBounces.length && !suppressed.length) outcome = "delivered";
  else if (!delivered.length && queued.length && !permanentBounces.length && !suppressed.length) outcome = "queued";
  else if (!delivered.length && !queued.length) outcome = "rejected";
  return {
    outcome,
    delivered,
    queued,
    permanent_bounces: permanentBounces,
    suppressed,
    message_id: oneLine(result && result.message_id),
  };
}

