import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateConfig, withDefaults, renderWrangler, loadConfig } from "../lib/config.mjs";
import { createContext, redact } from "../lib/cf.mjs";
import * as steps from "../lib/steps.mjs";
import { main, parseArgs } from "../r2-inbox.mjs";

const EXAMPLE = JSON.parse(readFileSync(new URL("../../r2-inbox.config.example.json", import.meta.url), "utf8"));
const TOKEN = "tok_" + "x".repeat(36);
const ACCOUNT = "0123456789abcdef0123456789abcdef";
const ENV = { CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT, NOTIFY_URL: "https://hooks.example.com/very-secret-path", NOTIFY_AUTH: "Bearer secret-auth-value" };
function cfgFile(over = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mbx-"));
  const p = join(dir, "r2-inbox.config.json");
  writeFileSync(p, JSON.stringify({ ...EXAMPLE, ...over }));
  return p;
}
async function run(args, extra = {}) {
  const lines = [];
  const noNet = async () => { throw new Error("network used in test"); };
  const noSpawn = () => { throw new Error("process spawned in test"); };
  const code = await main(args, { env: ENV, log: (m) => lines.push(String(m)), fetcher: noNet, spawn: noSpawn, ...extra });
  return { code, out: lines.join("\n") };
}

test("example config is valid", () => {
  assert.deepEqual(validateConfig(withDefaults(EXAMPLE)), []);
});
test("validation catches common mistakes", () => {
  const bad = withDefaults({ ...EXAMPLE, domain: "nope", bucket: "Bad_Bucket", rejectDropped: "yes",
    acceptRecipients: ["not an address"], routing: { mode: "addresses", addresses: ["x@other.example"] },
    webhook: { url: "http://insecure.example" }, lifecycle: { expireDays: -1 },
    workers: { email: "same", web: "same" } });
  const errs = validateConfig(bad).join("\n");
  for (const want of ["domain:", "bucket:", "rejectDropped", "acceptRecipients", "routing.addresses", "webhook.url", "lifecycle", "must differ"]) {
    assert.match(errs, new RegExp(want.replace(".", "\\.")), want);
  }
});
test("web inbox hostname must be on the zone; access needs team domain", () => {
  const e = validateConfig(withDefaults({ ...EXAMPLE, webInbox: { hostname: "inbox.other.example", access: { teamDomain: "x.example.com" } } }));
  assert.ok(e.some((x) => x.startsWith("webInbox.hostname")));
  assert.ok(e.some((x) => x.startsWith("webInbox.access.teamDomain")));
});
test("loadConfig reports a missing file helpfully", () => {
  assert.throws(() => loadConfig("/nonexistent/r2-inbox.config.json"), /cp r2-inbox.config.example.json/);
});
test("renderWrangler maps config to worker vars and bindings", () => {
  const c = withDefaults(EXAMPLE);
  const e = renderWrangler(c, "email", ACCOUNT);
  assert.equal(e.r2_buckets[0].binding, "INBOUND");
  assert.equal(e.vars.ACCEPT_RECIPIENTS, "you@example.com,you+*@example.com");
  assert.equal(e.vars.REJECT_DROPPED, "false");
  assert.equal(e.workers_dev, false);
  const w = renderWrangler(c, "web", ACCOUNT);
  assert.deepEqual(w.routes, [{ pattern: "inbox.example.com", custom_domain: true }]);
  assert.equal(w.r2_buckets[0].binding, "MAIL");
  assert.equal(w.workers_dev, false);
});
test("redact hides secrets", () => {
  assert.equal(redact(`a ${TOKEN} b`, [TOKEN]), "a *** b");
});
test("parseArgs", () => {
  assert.deepEqual(parseArgs(["deploy", "web", "--dry-run", "--config", "x.json"]), { _: ["deploy", "web"], flags: { "dry-run": true, config: "x.json" } });
});

test("setup --dry-run: no network/spawn, prints plan, never prints secrets or account id", async () => {
  const { code, out } = await run(["setup", "--dry-run", "--config", cfgFile()]);
  assert.equal(code, 0);
  for (const s of [TOKEN, ACCOUNT, ENV.NOTIFY_URL, "secret-auth-value"]) assert.ok(!out.includes(s), "leaked " + s.slice(0, 8));
  for (const want of ["/r2/buckets", "/access/apps", "wrangler deploy", "secret put NOTIFY_URL", "/email/routing/dns", "rules/catch_all", "$CLOUDFLARE_API_TOKEN"]) {
    assert.ok(out.includes(want), want);
  }
});
test("routing --dry-run in addresses mode creates one literal rule per address", async () => {
  const { out } = await run(["routing", "--dry-run", "--config", cfgFile({ routing: { mode: "addresses", addresses: ["you@example.com", "ops@example.com"] } })]);
  assert.equal((out.match(/-X POST "[^"]+\/email\/routing\/rules"/g) || []).length, 2);
  assert.match(out, /"matchers":\[\{"type":"literal","field":"to","value":"ops@example.com"\}\]/);
});
test("teardown keeps the bucket unless --delete-bucket", async () => {
  let r = await run(["teardown", "--dry-run", "--config", cfgFile()]);
  assert.match(r.out, /keep  R2 bucket/); assert.ok(!/-X DELETE "[^"]+\/r2\/buckets\//.test(r.out));
  r = await run(["teardown", "--dry-run", "--delete-bucket", "--config", cfgFile()]);
  assert.match(r.out, /-X DELETE "[^"]+\/r2\/buckets\/my-mail-bucket"/);
});
test("missing credentials are reported (no dry-run)", async () => {
  await assert.rejects(main(["routing", "--config", cfgFile()], { env: {}, log: () => {} }), /CLOUDFLARE_API_TOKEN/);
});

// Mocked API (no dry-run): routing is idempotent, token only in the Authorization header.
function mockApi(state) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body, auth: init.headers.authorization });
    const p = new URL(url).pathname.replace("/client/v4", "");
    const ok = (result) => new Response(JSON.stringify({ success: true, errors: [], result }), { status: 200 });
    if (p === "/zones") return ok([{ id: "zone1", name: "example.com" }]);
    if (p === "/zones/zone1/email/routing") return ok({ enabled: true, status: "ready" });
    if (p.endsWith("/rules/catch_all") && init.method === "GET") return ok(state.catchAll);
    if (p.endsWith("/rules/catch_all") && init.method === "PUT") { state.catchAll = JSON.parse(init.body); return ok(state.catchAll); }
    return new Response(JSON.stringify({ success: false, errors: [{ code: 7003, message: "no route" }] }), { status: 404 });
  };
  return { calls, fetcher };
}
test("routing (mocked API): PUTs when different, no-op when already correct, --force re-saves", async () => {
  const state = { catchAll: { enabled: true, matchers: [{ type: "all" }], actions: [{ type: "worker", value: ["old-name"] }] } };
  const m = mockApi(state);
  const file = cfgFile();
  await run(["routing", "--config", file], { fetcher: m.fetcher });
  assert.equal(m.calls.filter((c) => c.method === "PUT").length, 1);
  assert.deepEqual(state.catchAll.actions[0].value, ["r2-inbox-email"]);
  assert.ok(m.calls.every((c) => c.auth === `Bearer ${TOKEN}` && !c.url.includes(TOKEN)));
  m.calls.length = 0;
  const r = await run(["routing", "--config", file], { fetcher: m.fetcher });
  assert.equal(m.calls.filter((c) => c.method === "PUT").length, 0); assert.match(r.out, /ok    catch-all/);
  m.calls.length = 0;
  await run(["routing", "--force", "--config", file], { fetcher: m.fetcher });
  assert.equal(m.calls.filter((c) => c.method === "PUT").length, 1);
});
test("API errors are surfaced without the token", async () => {
  const ctx = createContext({ env: ENV, log: () => {}, fetcher: async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }), { status: 403 }) });
  await assert.rejects(ctx.api("GET", `/accounts/${ACCOUNT}/r2/buckets`), (e) => e.status === 403 && !e.message.includes(TOKEN) && !e.message.includes(ACCOUNT));
});
test("keyFromId / messageIdHash", () => {
  assert.equal(steps.keyFromId("20260102T030405006Z-0123456789abcdef"), "inbound/2026/01/02/20260102T030405006Z-0123456789abcdef.eml");
  assert.equal(steps.keyFromId("inbound/2026/01/02/x.eml"), "inbound/2026/01/02/x.eml");
  assert.equal(steps.keyFromId("../etc/passwd"), null);
  assert.equal(steps.messageIdHash("<abc@example.com>"), steps.messageIdHash("abc@example.com"));
});
test("message-id hash matches the email worker's key scheme", async () => {
  const { buildKey } = await import("../../apps/email-worker/src/index.js");
  const key = await buildKey("<abc@example.com>", new Date("2026-01-02T03:04:05.006Z"));
  assert.ok(key.endsWith(`-${steps.messageIdHash("<abc@example.com>")}.eml`));
});
test("droplist-sync rejects a malformed list before uploading", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dl-"));
  writeFileSync(join(dir, "bad.json"), JSON.stringify({ nope: 1 }));
  await assert.rejects(run(["droplist-sync", join(dir, "bad.json"), "--dry-run", "--config", cfgFile()]), /missing drop/);
  const { out } = await run(["droplist-sync", new URL("../../examples/droplist.example.json", import.meta.url).pathname, "--dry-run", "--config", cfgFile()]);
  assert.match(out, /r2 object put my-mail-bucket\/config\/droplist.json/);
});
test("lifecycle rules cover inbound/, dropped/, failed/", () => {
  assert.deepEqual(steps.lifecycleRules(30).map((r) => [r.conditions.prefix, r.deleteObjectsTransition.condition.maxAge]),
    [["inbound/", 2592000], ["dropped/", 2592000], ["failed/", 2592000]]);
});

// ---- private overlay ----
import { configPath } from "../lib/config.mjs";
test("config path resolution prefers --config, then env, then private dir", () => {
  assert.equal(configPath("/a/x.json", { R2_INBOX_CONFIG: "/b/y.json" }), "/a/x.json");
  assert.equal(configPath(undefined, { R2_INBOX_CONFIG: "/b/y.json", R2_INBOX_PRIVATE_DIR: "/p" }), "/b/y.json");
  assert.equal(configPath(undefined, { R2_INBOX_PRIVATE_DIR: "/p" }), "/p/r2-inbox.config.json");
});
test("private overlay: existing names/bucket, keepVars, workersDev, overlay-sync only config/*.json", async () => {
  const dir = mkdtempSync(join(tmpdir(), "priv-"));
  const { mkdirSync } = await import("node:fs");
  mkdirSync(join(dir, "r2", "config"), { recursive: true });
  writeFileSync(join(dir, "r2-inbox.config.json"), JSON.stringify({ ...EXAMPLE, domain: "example.org", bucket: "existing-bucket",
    workers: { email: "existing-email-worker", web: "existing-web" }, routing: { mode: "none" }, deploy: { keepVars: true },
    webInbox: { ...EXAMPLE.webInbox, hostname: "", workersDev: true, access: { enabled: false } } }));
  writeFileSync(join(dir, "r2", "config", "droplist.json"), readFileSync(new URL("../../examples/droplist.example.json", import.meta.url)));
  writeFileSync(join(dir, "droplist.json"), readFileSync(new URL("../../examples/droplist.example.json", import.meta.url)));
  const env = { ...ENV, R2_INBOX_PRIVATE_DIR: dir };
  const r1 = await run(["deploy", "--dry-run"], { env });
  assert.match(r1.out, /"name": "existing-email-worker"/); assert.match(r1.out, /"bucket_name": "existing-bucket"/);
  assert.match(r1.out, /"keep_vars": true/); assert.match(r1.out, /"workers_dev": true/);
  const r2 = await run(["routing", "--dry-run"], { env });
  assert.ok(!/-X (PUT|POST)[^\n]*rules/.test(r2.out)); assert.match(r2.out, /routing.mode = none/);
  const r3 = await run(["overlay-sync", "--dry-run"], { env });
  assert.match(r3.out, /existing-bucket\/config\/droplist.json/);
  const r4 = await run(["droplist-sync", "--dry-run"], { env });
  assert.match(r4.out, /existing-bucket\/config\/droplist.json --file .*priv-.*droplist.json/);
  mkdirSync(join(dir, "r2", "inbound"), { recursive: true });
  writeFileSync(join(dir, "r2", "inbound", "x.json"), "{}");
  await assert.rejects(run(["overlay-sync", "--dry-run"], { env }), /only config/);
});
