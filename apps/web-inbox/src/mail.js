import PostalMime from "postal-mime";
import { detectRemote, htmlToText, makeSnippet } from "./sanitize.js";

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/avif",
  "image/svg+xml",
]);

const EXTENSIONS = {
  "text/plain": ".txt",
  "text/html": ".html",
  "message/rfc822": ".eml",
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

export function headerComplete(bytes) {
  const text = new TextDecoder("latin1").decode(bytes);
  return text.includes("\r\n\r\n") || text.includes("\n\n");
}

export function decodeHeader(value) {
  if (!value) return "";
  const joined = String(value).replace(/\?=\s+=\?/g, "?==?");
  return joined
    .replace(/=\?([^?]+)\?([bBqQ])\?([\s\S]*?)\?=/g, (all, charset, encoding, text) => {
      try {
        let bytes;
        if (encoding.toLowerCase() === "b") {
          const binary = atob(text.replace(/\s/g, ""));
          bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        } else {
          const decoded = text
            .replace(/_/g, " ")
            .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
        }
        const label = charset.toLowerCase() === "utf8" ? "utf-8" : charset;
        return new TextDecoder(label).decode(bytes);
      } catch {
        return all;
      }
    })
    .replace(/[ \t]+/g, " ")
    .trim();
}

function mailbox(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const people = [];
  for (const item of list) {
    if (!item) continue;
    if (Array.isArray(item.group)) {
      for (const member of item.group) people.push(...mailbox(member));
      continue;
    }
    const name = item.name || "";
    const email = item.address || "";
    if (name || email) people.push({ name, email });
  }
  return people;
}

function attachmentName(part, index) {
  if (part.filename) return part.filename;
  const extension = EXTENSIONS[(part.mimeType || "").toLowerCase()] || "";
  return `attachment-${index + 1}${extension}`;
}

function isInline(part) {
  const disposition = (part.disposition || "").toLowerCase();
  const type = (part.mimeType || "").toLowerCase();
  const cid = (part.contentId || "").trim();
  if (disposition === "attachment") return false;
  if (cid && (type.startsWith("image/") || disposition === "inline" || part.related)) return true;
  if (disposition === "inline" && type.startsWith("image/")) return true;
  return false;
}

function asBytes(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (typeof content === "string") return new TextEncoder().encode(content);
  return new Uint8Array();
}

function contentId(part) {
  return (part.contentId || "").trim().replace(/^<|>$/g, "");
}

export async function parseMail(bytes, key) {
  const email = await PostalMime.parse(bytes);
  const from = mailbox(email.from)[0] || { name: "", email: "" };
  const to = mailbox(email.to);
  const cc = mailbox(email.cc);
  const bcc = mailbox(email.bcc);
  const replyTo = mailbox(email.replyTo);
  const parties = [...to, ...cc, ...bcc, ...replyTo]
    .flatMap((person) => [person.name, person.email])
    .filter(Boolean)
    .join(" ");
  const subject = decodeHeader(email.subject || "").trim() || "(No subject)";
  const html = (email.html || "").trim() || null;
  const text = (email.text || "").trim() || null;
  const cidMap = {};
  const parts = [];
  for (const [index, part] of (email.attachments || []).entries()) {
    const data = asBytes(part.content);
    const inline = isInline(part);
    const cid = contentId(part);
    if (cid) {
      const url = `/part?key=${encodeURIComponent(key)}&i=${index}`;
      cidMap[cid.toLowerCase()] = url;
      const local = cid.split("@", 1)[0].toLowerCase();
      if (!cidMap[local]) cidMap[local] = url;
    }
    parts.push({
      index,
      filename: attachmentName(part, index),
      contentType: (part.mimeType || "application/octet-stream").toLowerCase(),
      inline,
      size: data.byteLength,
      data,
    });
  }
  const files = parts.filter((part) => !part.inline);
  let hasAttachments = files.length > 0;
  if (!hasAttachments && /content-disposition:\s*attachment/i.test(new TextDecoder("latin1").decode(bytes))) {
    hasAttachments = true;
  }
  return {
    key,
    subject,
    from_name: from.name,
    from_email: from.email,
    to,
    cc,
    bcc,
    reply_to: replyTo,
    date: email.date || null,
    snippet: makeSnippet(text || htmlToText(html || "")),
    has_attachments: hasAttachments,
    parties,
    has_html: Boolean(html),
    remote_images: detectRemote(html),
    text: html ? null : text,
    html,
    cidMap,
    parts,
    headers: (email.headers || []).map((header) => ({
      name: header.originalKey || header.key,
      value: decodeHeader(header.value),
    })),
  };
}

export function listItem(view) {
  const item = {
    key: view.key,
    subject: view.subject || "(No subject)",
    from_name: view.from_name || "",
    from_email: view.from_email || "",
    date: view.date || null,
    last_modified: view.last_modified || null,
    received: view.received || null,
    size: view.size || 0,
    snippet: view.snippet || "",
    has_attachments: Boolean(view.has_attachments),
  };
  if (view.error) item.error = view.error;
  return item;
}

export function publicMessage(view) {
  return {
    ...listItem(view),
    to: view.to || [],
    cc: view.cc || [],
    bcc: view.bcc || [],
    reply_to: view.reply_to || [],
    has_html: Boolean(view.has_html),
    remote_images: Boolean(view.remote_images),
    text: view.text || null,
    attachments: (view.parts || [])
      .filter((part) => !part.inline)
      .map((part) => ({
        index: part.index,
        filename: part.filename,
        content_type: part.contentType,
        size: part.size,
      })),
    headers: view.headers || [],
  };
}

export function searchBlob(view) {
  return [view.subject, view.from_name, view.from_email, view.snippet, view.parties]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function partResponseMeta(part, download) {
  let contentType = part.contentType || "application/octet-stream";
  const inline = part.inline && IMAGE_TYPES.has(contentType) && !download;
  if (!inline && ["text/html", "image/svg+xml", "application/xhtml+xml"].includes(contentType)) {
    contentType = "application/octet-stream";
  }
  return { contentType, inline };
}

export { IMAGE_TYPES };
