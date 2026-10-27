import { test } from "node:test";
import assert from "node:assert/strict";
import { requireAccess, accessConfig, _resetJwksCache } from "../src/access.js";
import worker from "../src/index.js";

const TEAM = "myteam.cloudflareaccess.com";
const AUD = "test-audience-tag";
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1" };
const fetcher = async (url) => {
  assert.equal(url, `https://${TEAM}/cdn-cgi/access/certs`);
  return new Response(JSON.stringify({ keys: [jwk] }));
};
const b64u = (b) => Buffer.from(b).toString("base64url");
async function token(claims, header = { alg: "RS256", kid: "k1" }) {
  const now = Math.floor(Date.now() / 1000);
  const body = { aud: [AUD], iss: `https://${TEAM}`, exp: now + 600, email: "you@example.com", ...claims };
  const input = b64u(JSON.stringify(header)) + "." + b64u(JSON.stringify(body));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(input));
  return input + "." + b64u(new Uint8Array(sig));
}
const req = (t) => new Request("https://inbox.example.com/", { headers: t ? { "cf-access-jwt-assertion": t } : {} });

test("accessConfig is null unless both team and aud are set", () => {
  assert.equal(accessConfig({}), null);
  assert.equal(accessConfig({ ACCESS_TEAM_DOMAIN: TEAM }), null);
  assert.equal(accessConfig({ ACCESS_TEAM_DOMAIN: "https://" + TEAM + "/", ACCESS_AUD: AUD }).issuer, `https://${TEAM}`);
});
test("not configured: no-op", async () => {
  assert.equal(await requireAccess(req(), {}), null);
});
test("valid token passes", async () => {
  _resetJwksCache();
  const r = await requireAccess(req(await token({})), env, { fetcher });
  assert.equal(r.email, "you@example.com");
});
test("missing, wrong aud, wrong issuer, expired, bad alg, tampered all rejected with 403", async () => {
  _resetJwksCache();
  const bad = [
    "",
    await token({ aud: ["other"] }),
    await token({ iss: "https://evil.cloudflareaccess.com" }),
    await token({ exp: Math.floor(Date.now() / 1000) - 10 }),
    await token({}, { alg: "HS256", kid: "k1" }),
    await token({}, { alg: "RS256", kid: "unknown" }),
    (await token({})).replace(/\.[^.]+\./, "." + b64u(JSON.stringify({ aud: [AUD], iss: `https://${TEAM}`, exp: 9e9 })) + "."),
  ];
  for (const t of bad) {
    await assert.rejects(requireAccess(req(t), env, { fetcher }), (e) => e.status === 403);
  }
});
test("worker returns 403 JSON when Access is configured and token is missing", async () => {
  const res = await worker.fetch(req(), { ...env, MAIL: {} });
  assert.equal(res.status, 403);
  assert.match(await res.text(), /Access token missing/);
});
