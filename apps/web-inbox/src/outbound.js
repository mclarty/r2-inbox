// Cloudflare Email Sending (POST /accounts/{account_id}/email/sending/send).
// Cc and Bcc are first-class fields on that API. Bcc stays out of custom headers;
// the header allowlist rejects a Bcc header anyway (E_HEADER_USE_API_FIELD).
import { openMessage } from "./store.js";
import { cleanKey, httpError } from "./status.js";
import {
  attachmentFromBytes,
  buildDraft,
  collectOwnAddresses,
  deliveryOutcome,
  normalizeOutgoing,
  oneLine,
  payloadHash,
  sendRecordKey,
  submissionId,
} from "./compose.js";

const ACCOUNT_RE = /^[0-9a-f]{32}$/i;
const SEND_URL = "https://api.cloudflare.com/client/v4/accounts";

export function outboundSettings(env) {
  const from = oneLine(env && env.MAIL_FROM);
  const fromName = oneLine(env && env.MAIL_FROM_NAME);
  const replyTo = oneLine(env && env.MAIL_REPLY_TO);
  const accountId = oneLine(env && env.EMAIL_ACCOUNT_ID);
  const token = String((env && env.EMAIL_API_TOKEN) || "").trim();
  const missing = [];
  if (!from) missing.push("MAIL_FROM");
  if (!accountId) missing.push("EMAIL_ACCOUNT_ID");
  else if (!ACCOUNT_RE.test(accountId)) missing.push("EMAIL_ACCOUNT_ID");
  if (!token) missing.push("EMAIL_API_TOKEN");
  return {
    configured: missing.length === 0 && ACCOUNT_RE.test(accountId),
    from,
    fromName,
    replyTo,
    accountId,
    token,
    missing: [...new Set(missing)],
  };
}

export function publicOutbound(env) {
  const settings = outboundSettings(env);
  return {
    configured: settings.configured,
    from: settings.from,
    fromName: settings.fromName,
    replyTo: settings.replyTo,
    missing: settings.missing,
  };
}

function unconfigured(settings) {
  const names = settings.missing.join(", ");
  throw httpError(503, `Outbound mail is not configured (${names}). Set those on the web inbox worker and see docs/outbound.md. Nothing was sent.`);
}

function redact(text, token) {
  let out = oneLine(text).slice(0, 300);
  if (token) out = out.split(token).join("***");
  return out;
}

function providerError(response, payload, token) {
  const errors = payload && Array.isArray(payload.errors) ? payload.errors : [];
  const detail = errors.map((error) => oneLine(error && error.message)).filter(Boolean).join(" ");
  const ambiguous = !response || response.status === 408 || response.status === 429 || response.status >= 500;
  let message;
  if (response && (response.status === 401 || response.status === 403)) {
    message = "Cloudflare refused the sending token. It needs the Email Sending: Edit permission on this account. Nothing was sent.";
  } else if (detail) {
    message = ambiguous
      ? `Cloudflare did not confirm the send (${detail}). It was not retried, because it may already have been accepted.`
      : `Cloudflare rejected the message: ${detail}`;
  } else if (ambiguous) {
    message = "Cloudflare did not confirm the send. It was not retried, because it may already have been accepted.";
  } else {
    message = "Cloudflare rejected the message.";
  }
  const error = httpError(ambiguous ? 502 : response && response.status >= 400 ? 400 : 502, redact(message, token));
  if (ambiguous) error.ambiguous = true;
  return error;
}

export async function postToCloudflare(settings, payload, fetcher) {
  const url = `${SEND_URL}/${settings.accountId}/email/sending/send`;
  let response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    const error = httpError(502, "The mail service did not answer. The message was not retried, and it may or may not have been accepted.");
    error.ambiguous = true;
    throw error;
  }
  let text = "";
  try {
    text = await response.text();
  } catch {
    const error = httpError(502, "The mail service response could not be read. The message was not retried.");
    error.ambiguous = true;
    throw error;
  }
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok || !body || body.success !== true || !body.result) {
    throw providerError(response, body, settings.token);
  }
  return deliveryOutcome(body.result);
}

function objectEtag(object) {
  if (!object) return "";
  return String(object.httpEtag || object.etag || "");
}

async function readRecord(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  let record;
  if (typeof object.json === "function") record = await object.json();
  else if (typeof object.text === "function") record = JSON.parse(await object.text());
  else record = JSON.parse(new TextDecoder().decode(new Uint8Array(await object.arrayBuffer())));
  return { record, etag: objectEtag(object) };
}

function sameHash(record, hash) {
  return record && record.payloadHash === hash;
}

function conflict() {
  return httpError(409, "This submission id was already used for a different message. Nothing was sent.");
}

function inProgress() {
  const error = httpError(409, "This submission is already in progress, so it was not sent again.");
  error.ambiguous = true;
  return error;
}

function uncertain(message) {
  const error = httpError(409, message);
  error.ambiguous = true;
  return error;
}

// The loser of the create does not call the provider. It only reports the stored state.
async function replayClaim(bucket, key, hash) {
  const loaded = await readRecord(bucket, key);
  if (!loaded || !loaded.record) {
    throw uncertain("The send claim could not be read, so nothing was sent again. It may already have been accepted.");
  }
  const { record } = loaded;
  if (!sameHash(record, hash)) throw conflict();
  if (record.state === "done" && record.outcome) return { ...record.outcome, duplicate: true };
  if (record.state === "rejected") throw httpError(400, record.error || "Cloudflare rejected the message.");
  if (record.state === "ambiguous") {
    const detail = record.error || "It may already have been accepted.";
    throw uncertain(`A previous send did not finish cleanly, so it was not sent again. ${detail}`);
  }
  throw inProgress();
}

// Update the claim only if it is still the object we created. A failed update is
// not a reason to call the provider again.
async function finishRecord(bucket, key, etag, record) {
  const body = JSON.stringify(record);
  let currentEtag = etag;
  let lastFailure;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const stored = await bucket.put(key, body, {
        onlyIf: { etagMatches: currentEtag },
        httpMetadata: { contentType: "application/json" },
      });
      if (stored) return true;
      const loaded = await readRecord(bucket, key);
      if (loaded && sameHash(loaded.record, record.payloadHash) && loaded.record.state === record.state) return true;
      if (loaded && loaded.record.state === "claiming" && sameHash(loaded.record, record.payloadHash) && loaded.etag && loaded.etag !== currentEtag) {
        currentEtag = loaded.etag;
        continue;
      }
      return false;
    } catch (error) {
      if (error && error.status) throw error;
      lastFailure = error;
    }
  }
  return !lastFailure && false;
}

export async function sendMessage(env, input, idempotencyKey, fetcher) {
  const settings = outboundSettings(env);
  if (!settings.configured) unconfigured(settings);
  const id = submissionId(idempotencyKey);
  const bucket = env.MAIL;
  if (!bucket || typeof bucket.put !== "function" || typeof bucket.get !== "function") {
    throw httpError(503, "Outbound mail cannot store a send claim (MAIL R2 put/get). Nothing was sent.");
  }
  const send = typeof fetcher === "function"
    ? fetcher
    : (typeof env.EMAIL_FETCH === "function" ? env.EMAIL_FETCH : globalThis.fetch);
  const normalized = normalizeOutgoing(await withMaterializedAttachments(bucket, input), settings);
  const hash = await payloadHash(normalized.payload);
  const key = sendRecordKey(id);
  // Create-once. R2 evaluates etagDoesNotMatch: "*" (If-None-Match: *) atomically
  // with the write, so two isolates cannot both observe success.
  const created = await bucket.put(key, JSON.stringify({
    v: 1,
    id,
    payloadHash: hash,
    state: "claiming",
    at: new Date().toISOString(),
  }), {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" },
  });
  if (!created) return replayClaim(bucket, key, hash);
  const etag = objectEtag(created);
  if (!etag) {
    throw uncertain("The send claim did not return an etag, so nothing was sent again.");
  }
  try {
    const outcome = await postToCloudflare(settings, normalized.payload, send);
    await finishRecord(bucket, key, etag, {
      v: 1,
      id,
      payloadHash: hash,
      state: "done",
      at: new Date().toISOString(),
      outcome,
    });
    return outcome;
  } catch (error) {
    const ambiguous = Boolean(error && error.ambiguous);
    await finishRecord(bucket, key, etag, {
      v: 1,
      id,
      payloadHash: hash,
      state: ambiguous ? "ambiguous" : "rejected",
      at: new Date().toISOString(),
      error: error instanceof Error ? error.message : "The send failed.",
    });
    throw error;
  }
}

async function withMaterializedAttachments(bucket, input) {
  const body = input && typeof input === "object" ? { ...input } : input;
  if (!body || !Array.isArray(body.attachments)) return body;
  const attachments = [];
  for (const item of body.attachments) {
    if (!item || typeof item !== "object") throw httpError(400, "An attachment is not valid.");
    if (item.sourceKey != null || item.index != null) {
      if (item.content) throw httpError(400, "An attachment cannot be both uploaded and copied from a message.");
      const key = cleanKey(String(item.sourceKey || ""));
      const index = item.index;
      if (!Number.isInteger(index)) throw httpError(400, "That attachment is not in the message.");
      const message = await openMessage(bucket, key);
      const part = (message._view.parts || []).find((entry) => entry.index === index && !entry.inline);
      if (!part) throw httpError(400, "That attachment is not in the message.");
      attachments.push(attachmentFromBytes(part.filename, part.contentType, part.data));
      continue;
    }
    attachments.push(item);
  }
  body.attachments = attachments;
  return body;
}

export async function composeDraft(env, bucket, key, mode, accessEmail) {
  const message = await openMessage(bucket, key);
  const own = collectOwnAddresses(env, accessEmail);
  return buildDraft(message._view, mode, own);
}

export function assertSameOrigin(request, url) {
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) throw httpError(403, "Cross-site request refused.");
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") throw httpError(403, "Cross-site request refused.");
}

export async function readJsonBody(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw httpError(415, "Content-Type must be application/json.");
  }
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > 36_000_000) throw httpError(413, "That message is too large.");
  const text = await request.text();
  if (text.length > 36_000_000) throw httpError(413, "That message is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "The request body must be JSON.");
  }
}
