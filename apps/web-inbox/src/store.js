import { headerComplete, listItem, parseMail, publicMessage, searchBlob } from "./mail.js";
import { renderBody } from "./sanitize.js";
import {
  INBOX_PREFIX,
  STATUS_KINDS,
  cleanKey,
  deletableKey,
  emlKeyFromStatus,
  httpError,
  statusExplanation,
  statusJsonKey,
} from "./status.js";

const PREVIEW_BYTES = 64 * 1024;
const SEARCH_CAP = 8000;
const CACHE_MS = 30_000;

const previewCache = new Map();
const rawCache = new Map();
const reasonCache = new Map();
let objectCache = null;
let objectCacheAt = 0;
let flagCache = null;
let flagCacheAt = 0;
let unsubCache = null;
let unsubCacheAt = 0;

export const UNSUB_KEY = "config/unsubscribed.json";

export function invalidateLists() {
  objectCache = null;
  objectCacheAt = 0;
  flagCache = null;
  flagCacheAt = 0;
  unsubCache = null;
  unsubCacheAt = 0;
  reasonCache.clear();
}

export function resetCaches() {
  invalidateLists();
  previewCache.clear();
  rawCache.clear();
}

function remember(cache, id, value, max) {
  if (cache.has(id)) cache.delete(id);
  cache.set(id, value);
  while (cache.size > max) cache.delete(cache.keys().next().value);
}

function fresh(at) {
  return at && Date.now() - at < CACHE_MS;
}

async function listAll(bucket, prefix) {
  const objects = [];
  let cursor;
  for (;;) {
    const page = await bucket.list({ prefix, limit: 1000, cursor });
    objects.push(...(page.objects || []));
    if (!page.truncated) return objects;
    cursor = page.cursor;
  }
}

function stamp(object) {
  const value = object.uploaded;
  const time = value instanceof Date ? value.getTime() : Date.parse(value || "");
  return Number.isNaN(time) ? 0 : time;
}

// Arrival time from a key like inbound/2026/10/15/20261015T100937709Z-<hash>.eml.
export function keyTime(key) {
  const match = /(?:^|\/)(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})?Z[^/]*$/.exec(key || "");
  if (!match) return null;
  const [, y, mo, d, h, mi, sec, ms] = match;
  const time = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec, +(ms || 0));
  const date = new Date(time);
  if (Number.isNaN(time) || date.getUTCMonth() !== +mo - 1 || date.getUTCDate() !== +d) return null;
  return date.toISOString();
}

// One timestamp drives sort order, the list time and the day groups:
// arrival time from the key, then R2 upload time, then the Date header.
export function receivedTime(obj, headerDate) {
  const fromKey = keyTime(obj && obj.key);
  if (fromKey) return fromKey;
  if (obj && obj.last_modified) return obj.last_modified;
  const header = headerDate ? Date.parse(headerDate) : NaN;
  return Number.isNaN(header) ? null : new Date(header).toISOString();
}

function describe(object) {
  const described = {
    key: object.key,
    size: object.size || 0,
    etag: object.httpEtag || object.etag || "",
    last_modified: object.uploaded ? new Date(object.uploaded).toISOString() : null,
  };
  described.received = receivedTime(described, null);
  return described;
}

async function inboxObjects(bucket, refresh) {
  if (!refresh && objectCache && fresh(objectCacheAt)) return objectCache;
  const listed = await listAll(bucket, INBOX_PREFIX);
  const objects = listed
    .filter((object) => object.key && !object.key.endsWith("/") && object.key.toLowerCase().endsWith(".eml"))
    .filter((object) => !object.key.split("/").includes("..") && !object.key.includes("\\"))
    .map(describe)
    .sort((left, right) => stamp({ uploaded: right.received }) - stamp({ uploaded: left.received }) || right.key.localeCompare(left.key));
  objectCache = objects;
  objectCacheAt = Date.now();
  return objects;
}

async function getBytes(bucket, key, maxBytes) {
  const options = maxBytes ? { range: { offset: 0, length: maxBytes } } : undefined;
  const object = await bucket.get(key, options);
  if (!object) return null;
  const data = new Uint8Array(await object.arrayBuffer());
  const size = object.size ?? data.byteLength;
  const complete = !maxBytes || data.byteLength >= size;
  return {
    data,
    complete,
    meta: describe({ ...object, key, size }),
  };
}

async function previewBytes(bucket, obj) {
  if (obj.size != null && obj.size <= PREVIEW_BYTES) {
    const full = await getBytes(bucket, obj.key, null);
    return { data: full?.data || new Uint8Array(), complete: true };
  }
  const first = await getBytes(bucket, obj.key, PREVIEW_BYTES);
  if (!first) return { data: new Uint8Array(), complete: true };
  if (first.complete || headerComplete(first.data)) return first;
  if (obj.size != null && obj.size <= 2_000_000) {
    const full = await getBytes(bucket, obj.key, null);
    return { data: full?.data || first.data, complete: true };
  }
  return getBytes(bucket, obj.key, 256 * 1024);
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function errorPreview(obj, error) {
  return {
    key: obj.key,
    subject: "(Could not read)",
    from_name: "",
    from_email: "",
    date: null,
    last_modified: obj.last_modified,
    received: obj.received || null,
    size: obj.size || 0,
    snippet: error instanceof Error ? error.message : String(error),
    has_attachments: false,
    parties: "",
    error: error instanceof Error ? error.message : String(error),
  };
}

async function previewOne(bucket, obj) {
  const cached = previewCache.get(obj.key);
  if (cached && cached.etag === obj.etag && cached.size === obj.size) return cached.view;
  let view;
  try {
    const { data, complete } = await previewBytes(bucket, obj);
    view = await parseMail(data, obj.key);
    view.last_modified = obj.last_modified;
    view.received = receivedTime(obj, view.date);
    view.size = obj.size ?? data.byteLength;
    if (complete) remember(rawCache, `${obj.key}\0${obj.etag}\0${obj.size}`, data, 12);
  } catch (error) {
    view = errorPreview(obj, error);
  }
  previewCache.set(obj.key, { etag: obj.etag, size: obj.size, view });
  return view;
}

async function fullBytes(bucket, key) {
  const objects = await inboxObjects(bucket, false);
  let obj = objects.find((item) => item.key === key);
  if (!obj) {
    const freshObjects = await inboxObjects(bucket, true);
    obj = freshObjects.find((item) => item.key === key) || {
      key,
      size: null,
      etag: "",
      last_modified: null,
    };
  }
  const cacheId = `${key}\0${obj.etag}\0${obj.size}`;
  const cached = rawCache.get(cacheId);
  if (cached) {
    remember(rawCache, cacheId, cached, 12);
    return { obj, data: cached };
  }
  const loaded = await getBytes(bucket, key, null);
  if (!loaded) throw httpError(404, "That message is not in the bucket.");
  const meta = loaded.meta.size != null ? { ...obj, ...loaded.meta, key } : obj;
  remember(rawCache, `${key}\0${meta.etag}\0${meta.size}`, loaded.data, 12);
  return { obj: meta, data: loaded.data };
}

async function flagsFor(bucket, refresh) {
  if (refresh) {
    flagCache = null;
    flagCacheAt = 0;
  }
  if (flagCache && fresh(flagCacheAt)) return flagCache;
  const flags = new Map();
  for (const kind of STATUS_KINDS) {
    const listed = await listAll(bucket, kind.prefix);
    for (const object of listed) {
      if (!object.key || !object.key.toLowerCase().endsWith(".json")) continue;
      const emlKey = emlKeyFromStatus(object.key, kind.prefix);
      if (!emlKey) continue;
      const present = flags.get(emlKey) || new Set();
      present.add(kind.id);
      flags.set(emlKey, present);
    }
  }
  flagCache = flags;
  flagCacheAt = Date.now();
  return flags;
}

function flagRows(flags, key) {
  const present = flags.get(key) || new Set();
  return STATUS_KINDS.filter((kind) => present.has(kind.id)).map((kind) => ({
    id: kind.id,
    label: kind.label,
  }));
}

// config/unsubscribed.json is optional and written by an external tool (see docs/drop-lists.md):
// { keys: { <inbound key>: {status, method, ts, sender} }, senders: { <email>: {key, status, method, ts} } }
async function unsubscribedFor(bucket, refresh) {
  if (!refresh && unsubCache && fresh(unsubCacheAt)) return unsubCache;
  const loaded = await getBytes(bucket, UNSUB_KEY, null);
  let parsed = {};
  if (loaded) parsed = JSON.parse(new TextDecoder().decode(loaded.data)) || {};
  const keys = parsed.keys && typeof parsed.keys === "object" ? parsed.keys : {};
  const senders = new Map();
  for (const [email, entry] of Object.entries(parsed.senders || {})) senders.set(email.toLowerCase(), entry || {});
  for (const [key, entry] of Object.entries(keys)) {
    const email = entry && typeof entry.sender === "string" ? entry.sender.toLowerCase() : "";
    if (email && !senders.has(email)) senders.set(email, { ...entry, key });
  }
  unsubCache = { keys, senders };
  unsubCacheAt = Date.now();
  return unsubCache;
}

function unsubDate(ts) {
  const time = Date.parse(ts || "");
  return Number.isNaN(time) ? "" : new Date(time).toISOString().slice(0, 10);
}

export function unsubRows(unsub, view) {
  if (!unsub) return [];
  const own = unsub.keys[view.key];
  if (own) {
    const ok = own.status === "ok" || own.status === "sent";
    return [{
      id: "unsubscribed",
      label: ok ? "Unsubscribed" : "Unsubscribe attempted",
      title: [own.method, own.status, unsubDate(own.ts)].filter(Boolean).join(" · "),
    }];
  }
  const sender = (view.from_email || "").toLowerCase();
  const entry = sender && unsub.senders.get(sender);
  if (!entry) return [];
  return [{
    id: "unsubscribed-sender",
    label: "Unsub'd sender",
    title: "Unsubscribed from " + sender + (unsubDate(entry.ts) ? " on " + unsubDate(entry.ts) : ""),
  }];
}

async function reasonFor(bucket, kind, jsonKey) {
  if (reasonCache.has(jsonKey)) return reasonCache.get(jsonKey);
  try {
    const loaded = await getBytes(bucket, jsonKey, null);
    if (!loaded) return "";
    const payload = JSON.parse(new TextDecoder().decode(loaded.data));
    const text = statusExplanation(kind.id, payload);
    reasonCache.set(jsonKey, text);
    return text;
  } catch {
    return "";
  }
}

export async function queryMessages(bucket, { offset, limit, text, refresh }) {
  if (refresh) invalidateLists();
  const objects = await inboxObjects(bucket, refresh);
  let matched = objects;
  let capped = false;
  if (text) {
    const needle = text.toLowerCase();
    const scan = objects.slice(0, SEARCH_CAP);
    capped = objects.length > SEARCH_CAP;
    const views = await mapPool(scan, 6, (obj) => previewOne(bucket, obj));
    matched = views.filter((view) => searchBlob(view).includes(needle));
  }
  const page = text
    ? matched.slice(offset, offset + limit)
    : await mapPool(matched.slice(offset, offset + limit), 6, (obj) => previewOne(bucket, obj));
  let flags = new Map();
  let statusError = "";
  try {
    flags = await flagsFor(bucket, refresh);
  } catch (error) {
    statusError = error instanceof Error ? error.message : String(error);
  }
  let unsub = null;
  try {
    unsub = await unsubscribedFor(bucket, refresh);
  } catch {
    unsub = null;
  }
  const payload = {
    total: objects.length,
    matched: text ? matched.length : objects.length,
    offset,
    search_capped: capped,
    prefix: INBOX_PREFIX,
    messages: page.map((view) => ({ ...listItem(view), statuses: [...flagRows(flags, view.key), ...unsubRows(unsub, view)] })),
  };
  if (statusError) payload.status_error = statusError;
  return payload;
}

export async function openMessage(bucket, key) {
  const safe = cleanKey(key);
  const { obj, data } = await fullBytes(bucket, safe);
  const view = await parseMail(data, safe);
  view.last_modified = obj.last_modified;
  view.received = receivedTime(obj, view.date);
  view.size = obj.size ?? data.byteLength;
  const message = publicMessage(view);
  const rows = [];
  try {
    const flags = await flagsFor(bucket, false);
    for (const kind of STATUS_KINDS) {
      if (!(flags.get(safe) || new Set()).has(kind.id)) continue;
      const jsonKey = statusJsonKey(safe, kind.prefix);
      const reason = jsonKey ? await reasonFor(bucket, kind, jsonKey) : "";
      const row = { id: kind.id, label: kind.label };
      if (reason) row.reason = reason;
      rows.push(row);
    }
  } catch {
    rows.length = 0;
  }
  message.statuses = rows;
  message._view = view;
  return message;
}

export async function messageBody(bucket, key, allowRemote, requestHost) {
  const message = await openMessage(bucket, key);
  const view = message._view;
  if (!view.html) {
    const text = view.text || "This message has no body.";
    return renderBody({ html: `<pre>${escapePre(text)}</pre>`, cidMap: {} }, false, requestHost);
  }
  return renderBody(view, allowRemote, requestHost);
}

function escapePre(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function messagePart(bucket, key, index) {
  const message = await openMessage(bucket, key);
  const part = (message._view.parts || []).find((item) => item.index === index);
  if (!part) throw httpError(404, "That attachment is not in the message.");
  return part;
}

function forgetMessage(key) {
  invalidateLists();
  previewCache.delete(key);
  for (const id of [...rawCache.keys()]) {
    if (id.startsWith(`${key}\0`)) rawCache.delete(id);
  }
}

async function recordPointsAt(bucket, jsonKey, key) {
  try {
    const loaded = await getBytes(bucket, jsonKey, null);
    if (!loaded) return false;
    const payload = JSON.parse(new TextDecoder().decode(loaded.data));
    return !!payload && typeof payload === "object" && payload.key === key;
  } catch {
    return false;
  }
}

// The status records that belong to one message: the record at the mirrored
// path (failed/2026/10/15/<stem>.json for inbound/2026/10/15/<stem>.eml), plus
// any other <stem>.json under the same prefix whose "key" field names the message.
async function statusRecordsFor(bucket, key) {
  const stem = key.slice(key.lastIndexOf("/") + 1, -4);
  const records = [];
  for (const kind of STATUS_KINDS) {
    const mirrored = statusJsonKey(key, kind.prefix);
    const listed = await listAll(bucket, kind.prefix);
    for (const object of listed) {
      if (!object.key || object.key.slice(object.key.lastIndexOf("/") + 1) !== `${stem}.json`) continue;
      if (object.key === mirrored || (await recordPointsAt(bucket, object.key, key))) {
        records.push({ kind: kind.id, key: object.key });
      }
    }
  }
  return records;
}

export async function deleteMessage(bucket, key) {
  const safe = deletableKey(key);
  const message = await bucket.head(safe);
  const records = await statusRecordsFor(bucket, safe);
  if (!message && !records.length) throw httpError(404, "That message is not in the bucket.");
  const doomed = [...(message ? [safe] : []), ...records.map((record) => record.key)];
  await bucket.delete(doomed);
  forgetMessage(safe);
  return {
    deleted: true,
    key: safe,
    message: message ? safe : null,
    status_records: records,
    removed: doomed,
  };
}

export { cleanKey };
