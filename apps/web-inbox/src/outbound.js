// Cloudflare Email Sending (POST /accounts/{account_id}/email/sending/send).
// Cc and Bcc are first-class fields on that API. Bcc stays out of custom headers;
// the header allowlist rejects a Bcc header anyway (E_HEADER_USE_API_FIELD).
import { openMessage } from "./store.js";
import { httpError } from "./status.js";
import {
  buildDraft,
  claimSend,
  collectOwnAddresses,
  deliveryOutcome,
  normalizeOutgoing,
  oneLine,
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

export async function sendMessage(env, input, idempotencyKey, fetcher) {
  const settings = outboundSettings(env);
  if (!settings.configured) unconfigured(settings);
  const send = typeof fetcher === "function"
    ? fetcher
    : (typeof env.EMAIL_FETCH === "function" ? env.EMAIL_FETCH : globalThis.fetch);
  const normalized = normalizeOutgoing(input, settings);
  const result = await claimSend(idempotencyKey, () => postToCloudflare(settings, normalized.payload, send));
  return { ...result, duplicate: Boolean(result.duplicate) };
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
  if (Number.isFinite(declared) && declared > 300_000) throw httpError(413, "That message is too large.");
  const text = await request.text();
  if (text.length > 300_000) throw httpError(413, "That message is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "The request body must be JSON.");
  }
}
