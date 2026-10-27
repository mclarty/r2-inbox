import { PAGE } from "./page.js";
import { partResponseMeta } from "./mail.js";
import { deleteMessage, messageBody, messagePart, openMessage, queryMessages } from "./store.js";
import { httpError } from "./status.js";
import { requireAccess } from "./access.js";

function intArg(url, name, fallback, low, high) {
  const raw = (url.searchParams.get(name) || "").trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value)) return fallback;
  return Math.max(low, Math.min(high, value));
}

function truthy(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

function baseHeaders(extra = {}) {
  return {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    ...extra,
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: baseHeaders({ "content-type": "application/json; charset=utf-8" }),
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: baseHeaders({ "content-type": "text/html; charset=utf-8" }),
  });
}

function contentDisposition(kind, filename) {
  const fallback = [...filename].map((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code < 127 && char !== '"' && char !== "\\" ? char : "_";
  }).join("").trim() || "attachment";
  const encoded = encodeURIComponent(filename);
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      const status = error && [400, 403, 404, 405, 415, 500].includes(error.status) ? error.status : 500;
      const message = error instanceof Error ? error.message : "Request failed.";
      return json({ error: message }, status);
    }
  },
};

// Cloudflare Access guards every request. On top of that, a delete has to be a
// same-origin DELETE, so a page on another site cannot trigger one.
function deleteRequest(request, url) {
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) throw httpError(403, "Cross-site delete refused.");
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") throw httpError(403, "Cross-site delete refused.");
  return url.searchParams.get("key") || "";
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  await requireAccess(request, env);
  const method = request.method;
  if (method === "DELETE" ? path !== "/api/message" : method !== "GET" && method !== "HEAD") {
    throw httpError(405, "Method not allowed.");
  }
  if (path === "/") return html(PAGE);
  if (path === "/favicon.ico") return new Response(null, { status: 204, headers: baseHeaders() });
  if (!env.MAIL) throw httpError(500, "The MAIL R2 binding is not configured.");
  if (path === "/api/messages") {
    const payload = await queryMessages(env.MAIL, {
      offset: intArg(url, "offset", 0, 0, 1_000_000),
      limit: intArg(url, "limit", 50, 1, 100),
      text: (url.searchParams.get("q") || "").trim(),
      refresh: truthy(url.searchParams.get("refresh")),
    });
    payload.bucket = env.BUCKET_NAME || "mail";
    return json(payload);
  }
  if (path === "/api/message" && request.method === "DELETE") {
    const key = deleteRequest(request, url);
    return json(await deleteMessage(env.MAIL, key));
  }
  if (path === "/api/message" || path === "/body" || path === "/part") {
    const key = url.searchParams.get("key") || "";
    if (path === "/api/message") {
      const message = await openMessage(env.MAIL, key);
      delete message._view;
      return json(message);
    }
    if (path === "/body") {
      const allowRemote = truthy(url.searchParams.get("images"), true);
      const body = await messageBody(env.MAIL, key, allowRemote, url.host);
      return html(body);
    }
    const index = Number.parseInt(url.searchParams.get("i") || "", 10);
    if (!Number.isInteger(index)) throw httpError(400, "Missing attachment index.");
    const part = await messagePart(env.MAIL, key, index);
    const download = truthy(url.searchParams.get("download"));
    const { contentType, inline } = partResponseMeta(part, download);
    const headers = baseHeaders({
      "content-type": contentType,
      "content-disposition": contentDisposition(inline ? "inline" : "attachment", part.filename),
    });
    if (!inline || contentType === "image/svg+xml") {
      headers["content-security-policy"] = "default-src 'none'; sandbox";
    }
    return new Response(part.data, { status: 200, headers });
  }
  return json({ error: "Not found." }, 404);
}
