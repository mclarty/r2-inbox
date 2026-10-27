// Optional in-Worker verification of the Cloudflare Access JWT (defense in depth).
//
// Cloudflare Access is the primary gate: it runs at the edge before the Worker and
// a request that fails the policy never reaches this code. When ACCESS_TEAM_DOMAIN
// and ACCESS_AUD are both set, the Worker additionally verifies the
// `Cf-Access-Jwt-Assertion` header (RS256, issuer, audience, expiry) so that a
// misconfigured route (e.g. an unprotected workers.dev URL) cannot expose mail.
import { httpError } from "./status.js";

const JWKS_TTL_MS = 10 * 60 * 1000;
let jwksCache = { at: 0, url: "", keys: null };
export function _resetJwksCache() { jwksCache = { at: 0, url: "", keys: null }; }

function b64urlBytes(s) {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function b64urlJson(s) { return JSON.parse(new TextDecoder().decode(b64urlBytes(s))); }

export function accessConfig(env) {
  const team = String(env.ACCESS_TEAM_DOMAIN || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const aud = String(env.ACCESS_AUD || "").trim();
  return team && aud ? { team, aud, issuer: `https://${team}` } : null;
}

async function signingKeys(cfg, fetcher) {
  const url = `${cfg.issuer}/cdn-cgi/access/certs`;
  if (jwksCache.keys && jwksCache.url === url && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetcher(url);
  if (!res.ok) throw httpError(500, "Could not load Access signing keys.");
  const body = await res.json();
  jwksCache = { at: Date.now(), url, keys: Array.isArray(body.keys) ? body.keys : [] };
  return jwksCache.keys;
}

// Throws httpError(403) unless the request carries a valid Access JWT. No-op when not configured.
export async function requireAccess(request, env, { fetcher = fetch, now = Date.now() } = {}) {
  const cfg = accessConfig(env);
  if (!cfg) return null;
  const token = request.headers.get("cf-access-jwt-assertion") || "";
  const parts = token.split(".");
  if (parts.length !== 3) throw httpError(403, "Access token missing.");
  let header, payload;
  try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); }
  catch { throw httpError(403, "Access token malformed."); }
  if (header.alg !== "RS256") throw httpError(403, "Access token algorithm not accepted.");
  const keys = await signingKeys(cfg, fetcher);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw httpError(403, "Access token key unknown.");
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) throw httpError(403, "Access token signature invalid.");
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(cfg.aud)) throw httpError(403, "Access token audience mismatch.");
  if (payload.iss !== cfg.issuer) throw httpError(403, "Access token issuer mismatch.");
  const sec = Math.floor(now / 1000);
  if (typeof payload.exp !== "number" || payload.exp < sec) throw httpError(403, "Access token expired.");
  if (typeof payload.nbf === "number" && payload.nbf > sec + 60) throw httpError(403, "Access token not yet valid.");
  return { email: payload.email || "" };
}
