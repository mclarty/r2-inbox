// Sent activity from the documented Email Sending dataset `emailSendingAdaptive`.
// This is metadata only. The dashboard message preview is not part of this API,
// and Email Routing datasets are not queried here.
import { httpError } from "./status.js";
import { oneLine } from "./compose.js";

const GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";
const RETENTION_MS = 31 * 24 * 60 * 60 * 1000;
const ZONE_RE = /^[0-9a-f]{32}$/i;

const QUERY = `query RecentEmailEvents($zoneTag: string!, $start: Time!, $end: Time!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      emailSendingAdaptive(
        filter: { datetime_geq: $start, datetime_lt: $end }
        limit: 50
        orderBy: [datetime_DESC]
      ) {
        datetime
        from
        to
        subject
        status
        eventType
        sendingDomain
        envelopeTo
        messageId
        sessionId
        errorCause
        errorDetail
        dkim
        dmarc
        spf
        arc
        isSpam
        isNDR
        isLastEvent
      }
    }
  }
}`;

export function sentSettings(env) {
  const zoneId = oneLine(env && env.EMAIL_ZONE_ID);
  const token = String((env && env.EMAIL_ANALYTICS_TOKEN) || "").trim();
  const missing = [];
  if (!zoneId || !ZONE_RE.test(zoneId)) missing.push("EMAIL_ZONE_ID");
  if (!token) missing.push("EMAIL_ANALYTICS_TOKEN");
  return { configured: missing.length === 0, zoneId, token, missing };
}

export function sentStatus(status) {
  const raw = oneLine(status);
  const key = raw.toLowerCase();
  if (key === "delivered") return { status: raw, label: "Delivered", pending: false };
  if (key === "deliveryfailed") return { status: raw, label: "Delivery failed", pending: false };
  if (key === "rejected") return { status: raw, label: "Rejected", pending: false };
  if (key === "failed") return { status: raw, label: "Failed", pending: false };
  if (key === "sent" || key === "queued" || key === "accepted") {
    return { status: raw || "sent", label: "Sent", pending: true };
  }
  return { status: raw, label: raw || "Unknown", pending: false };
}

function redact(text, token) {
  let out = oneLine(text).slice(0, 300);
  if (token) out = out.split(token).join("***");
  return out;
}

const ACTIVITY_BASE_RE = /^\/[0-9a-f]{32}\/email-service\/sending\/[0-9a-f]{32}\/[0-9a-f]{32}\/activity-log$/i;
const MESSAGE_ID_RE = /^<?[^<>\s/%\\?#]+@[^<>\s/%\\?#]+>?$/;

export function activityLogUrl(base, messageId, accountId = "") {
  const prefix = String(base || "").trim().replace(/\/+$/, "");
  if (!prefix) return { url: "", reason: "missing" };
  let parsed;
  try {
    parsed = new URL(prefix);
  } catch {
    return { url: "", reason: "invalid" };
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "dash.cloudflare.com" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) {
    return { url: "", reason: "invalid" };
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  if (!ACTIVITY_BASE_RE.test(path)) return { url: "", reason: "invalid" };
  const account = path.split("/")[1] || "";
  const expected = oneLine(accountId).toLowerCase();
  if (expected && account.toLowerCase() !== expected) return { url: "", reason: "account" };
  const id = String(messageId || "").trim();
  if (!MESSAGE_ID_RE.test(id) || id.length > 998) return { url: "", reason: "message" };
  return { url: `https://dash.cloudflare.com${path}/${encodeURIComponent(id)}`, reason: "" };
}

function dashboardState(env) {
  const accountId = oneLine(env && env.EMAIL_ACCOUNT_ID);
  const base = oneLine(env && env.EMAIL_ACTIVITY_LOG_BASE);
  if (!base) {
    return {
      enabled: false,
      base: "",
      accountId,
      reason: "Open in Cloudflare is off until outbound.activityLogBase is set to the dashboard activity-log prefix.",
    };
  }
  const probe = activityLogUrl(base, "<probe@example.com>", accountId);
  if (!probe.url) {
    const reason = probe.reason === "account"
      ? "Open in Cloudflare is off because the activity-log prefix account does not match EMAIL_ACCOUNT_ID."
      : "Open in Cloudflare is off because outbound.activityLogBase is not an https://dash.cloudflare.com activity-log prefix.";
    return { enabled: false, base: "", accountId, reason };
  }
  return { enabled: true, base, accountId, reason: "" };
}

export function mapSentEvent(event) {
  const status = sentStatus(event && event.status);
  return {
    datetime: oneLine(event && event.datetime),
    from: oneLine(event && event.from),
    to: oneLine(event && event.to),
    envelope_to: oneLine(event && event.envelopeTo),
    subject: oneLine(event && event.subject) || "(no subject)",
    status: status.status,
    label: status.label,
    pending: status.pending,
    event_type: oneLine(event && event.eventType),
    sending_domain: oneLine(event && event.sendingDomain),
    message_id: oneLine(event && event.messageId),
    session_id: oneLine(event && event.sessionId),
    error_cause: oneLine(event && event.errorCause),
    error_detail: oneLine(event && event.errorDetail),
    spf: oneLine(event && event.spf),
    dkim: oneLine(event && event.dkim),
    dmarc: oneLine(event && event.dmarc),
    arc: oneLine(event && event.arc),
    spam: event && event.isSpam === 1,
    ndr: event && event.isNDR === 1,
    last_event: event && event.isLastEvent === 1,
  };
}

export async function listSent(env, { before, now = new Date() } = {}, fetcher = globalThis.fetch) {
  const settings = sentSettings(env);
  if (!settings.configured) {
    throw httpError(503, `Sent activity is not configured (${settings.missing.join(", ")}). The Email Sending activity log needs a zone id and an Analytics Read token. Nothing was queried.`);
  }
  const endDate = before ? new Date(before) : new Date(now.getTime() + 1000);
  if (Number.isNaN(endDate.getTime())) throw httpError(400, "That activity page is not valid.");
  const startDate = new Date(endDate.getTime() - RETENTION_MS);
  let response;
  try {
    response = await fetcher(GRAPHQL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          zoneTag: settings.zoneId,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      }),
    });
  } catch {
    throw httpError(502, "Email Sending activity could not be loaded.");
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload || payload.errors) {
    const detail = payload && Array.isArray(payload.errors) ? payload.errors.map((error) => oneLine(error.message)).filter(Boolean).join(" ") : "";
    throw httpError(response && (response.status === 401 || response.status === 403) ? 502 : 502, redact(detail || "Email Sending activity was refused. Check Analytics Read on the zone token.", settings.token));
  }
  const zones = payload.data && payload.data.viewer && payload.data.viewer.zones;
  const events = (zones && zones[0] && zones[0].emailSendingAdaptive) || [];
  const mapped = events.map(mapSentEvent).filter((event) => event.datetime);
  const dashboard = dashboardState(env);
  const withLinks = mapped.map((event) => ({
    ...event,
    dashboard_url: dashboard.enabled ? activityLogUrl(dashboard.base, event.message_id, dashboard.accountId).url : "",
  }));
  const oldest = withLinks.length ? withLinks[withLinks.length - 1].datetime : "";
  return {
    source: "emailSendingAdaptive",
    retention_days: 31,
    content: "metadata-only",
    note: "This is Email Sending activity for the last 31 days. Message bodies and attachment files are not included. Opening a dashboard link does not add a body preview; Cloudflare shows one only when Email preview was on for that send, for about seven days.",
    dashboard: { enabled: dashboard.enabled, reason: dashboard.reason },
    events: withLinks,
    next_before: withLinks.length === 50 ? oldest : "",
  };
}
