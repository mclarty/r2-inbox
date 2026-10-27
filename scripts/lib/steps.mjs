// Idempotent setup / deploy / routing / teardown steps. Every step first reads the
// current state and only writes when something differs, so re-running is safe.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { renderWrangler } from "./config.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const APP_DIR = { email: join(ROOT, "apps", "email-worker"), web: join(ROOT, "apps", "web-inbox") };
export const GENERATED = ".wrangler.generated.json";
export const RULE_TAG = "r2-inbox"; // prefix of routing rule names we own
const acct = (ctx) => `/accounts/${ctx.accountId || "$CLOUDFLARE_ACCOUNT_ID"}`;

// ---------- zone ----------
export async function findZone(ctx, cfg) {
  const q = `/zones?name=${encodeURIComponent(cfg.domain)}` + (ctx.accountId ? `&account.id=${ctx.accountId}` : "");
  const res = await ctx.api("GET", q, undefined, { dryResult: [{ id: "<zone_id>", name: cfg.domain, status: "active" }] });
  const zone = (res || [])[0];
  if (!zone) throw new Error(`zone ${cfg.domain} not found in this account (or token lacks Zone:Read)`);
  return zone;
}

// ---------- R2 ----------
export async function ensureBucket(ctx, cfg) {
  const path = `${acct(ctx)}/r2/buckets/${cfg.bucket}`;
  const existing = await ctx.api("GET", path, undefined, { allow404: true, dryResult: null });
  if (existing) { ctx.log(`ok    R2 bucket ${cfg.bucket} exists`); }
  else {
    await ctx.api("POST", `${acct(ctx)}/r2/buckets`, { name: cfg.bucket });
    ctx.log(`done  R2 bucket ${cfg.bucket} created`);
  }
  // Keep the bucket private: make sure the public r2.dev URL is off.
  const managed = await ctx.api("GET", `${path}/domains/managed`, undefined, { allow404: true, dryResult: { enabled: false } });
  if (managed && managed.enabled) {
    await ctx.api("PUT", `${path}/domains/managed`, { enabled: false });
    ctx.log(`done  disabled public r2.dev access on ${cfg.bucket}`);
  }
}

export function lifecycleRules(days) {
  return ["inbound/", "dropped/", "failed/"].map((prefix) => ({
    id: `${RULE_TAG}-expire-${prefix.replace("/", "")}`,
    enabled: true,
    conditions: { prefix },
    deleteObjectsTransition: { condition: { type: "Age", maxAge: days * 86400 } },
  }));
}

// Note: this PUT replaces the bucket's lifecycle rules. Only run on a dedicated bucket.
export async function ensureLifecycle(ctx, cfg) {
  const days = cfg.lifecycle.expireDays;
  if (!days) { ctx.log("skip  lifecycle (expireDays = 0, mail is kept until deleted)"); return; }
  await ctx.api("PUT", `${acct(ctx)}/r2/buckets/${cfg.bucket}/lifecycle`, { rules: lifecycleRules(days) });
  ctx.log(`done  lifecycle: inbound/, dropped/, failed/ expire after ${days} days`);
}

// ---------- Email Routing ----------
export async function ensureEmailRouting(ctx, cfg, zone) {
  const st = await ctx.api("GET", `/zones/${zone.id}/email/routing`, undefined, { dryResult: { enabled: false } });
  if (st && st.enabled) { ctx.log(`ok    Email Routing enabled on ${cfg.domain}`); return st; }
  if (!cfg.routing.enableEmailRouting) {
    throw new Error(`Email Routing is not enabled on ${cfg.domain}; enable it or set routing.enableEmailRouting=true`);
  }
  // Enables Email Routing and adds the required MX + SPF TXT records (replaces other MX records!).
  const res = await ctx.api("POST", `/zones/${zone.id}/email/routing/dns`, { name: cfg.domain });
  ctx.log(`done  Email Routing enabled on ${cfg.domain} (Cloudflare MX/SPF records added)`);
  return res;
}

export function desiredRules(cfg) {
  const action = [{ type: "worker", value: [cfg.workers.email] }];
  if (cfg.routing.mode === "catch_all") return { catchAll: { name: `${RULE_TAG}: catch-all`, enabled: true, matchers: [{ type: "all" }], actions: action }, literal: [] };
  if (cfg.routing.mode === "addresses") {
    return {
      catchAll: null,
      literal: cfg.routing.addresses.map((a) => ({
        name: `${RULE_TAG}: ${a.toLowerCase()}`, enabled: true, priority: 0,
        matchers: [{ type: "literal", field: "to", value: a.toLowerCase() }], actions: action,
      })),
    };
  }
  return { catchAll: null, literal: [] };
}

const sameRule = (a, b) => a && b && a.enabled === b.enabled &&
  JSON.stringify(a.actions) === JSON.stringify(b.actions) && JSON.stringify(a.matchers) === JSON.stringify(b.matchers);

// Creates/updates rules so mail goes to the email worker. Always re-PUTs when `force`
// (useful after a worker rename: the rule stores the worker name as a plain string).
export async function ensureRouting(ctx, cfg, zone, { force = false } = {}) {
  const want = desiredRules(cfg);
  const base = `/zones/${zone.id}/email/routing/rules`;
  if (want.catchAll) {
    const cur = await ctx.api("GET", `${base}/catch_all`, undefined, { dryResult: null });
    if (!force && sameRule(cur, want.catchAll)) ctx.log(`ok    catch-all -> worker ${cfg.workers.email}`);
    else {
      await ctx.api("PUT", `${base}/catch_all`, want.catchAll);
      ctx.log(`done  catch-all -> worker ${cfg.workers.email}`);
    }
  }
  if (want.literal.length) {
    const rules = (await ctx.api("GET", `${base}?per_page=50`, undefined, { dryResult: [] })) || [];
    for (const w of want.literal) {
      const addr = w.matchers[0].value;
      const cur = rules.find((r) => (r.matchers || []).some((m) => m.type === "literal" && m.field === "to" && String(m.value).toLowerCase() === addr));
      if (cur && !force && sameRule(cur, w)) { ctx.log(`ok    ${addr} -> worker ${cfg.workers.email}`); continue; }
      if (cur) await ctx.api("PUT", `${base}/${cur.id || cur.tag}`, w);
      else await ctx.api("POST", base, w);
      ctx.log(`done  ${addr} -> worker ${cfg.workers.email}`);
    }
  }
  if (!want.catchAll && !want.literal.length) ctx.log("skip  routing (routing.mode = none)");
}

// ---------- Access ----------
export function accessAppBody(cfg) {
  const a = cfg.webInbox.access;
  return {
    name: `${RULE_TAG} web inbox (${cfg.webInbox.hostname})`,
    domain: cfg.webInbox.hostname,
    type: "self_hosted",
    session_duration: a.sessionDuration || "24h",
    app_launcher_visible: false,
    policies: [{
      name: `${RULE_TAG} allow listed emails`, decision: "allow", precedence: 1,
      include: a.allowEmails.map((email) => ({ email: { email } })),
    }],
  };
}

// Returns the Access application AUD tag (needed by the web inbox for JWT verification).
export async function ensureAccess(ctx, cfg) {
  const w = cfg.webInbox;
  if (!w.enabled || !w.access.enabled) { ctx.log("skip  Cloudflare Access (disabled in config)"); return ""; }
  const apps = (await ctx.api("GET", `${acct(ctx)}/access/apps?per_page=100`, undefined, { dryResult: [] })) || [];
  const cur = apps.find((x) => String(x.domain || "").replace(/\/.*$/, "").toLowerCase() === w.hostname.toLowerCase());
  const body = accessAppBody(cfg);
  let app;
  if (cur) {
    app = await ctx.api("PUT", `${acct(ctx)}/access/apps/${cur.id}`, body, { dryResult: { aud: "<access_aud>" } });
    ctx.log(`done  Access application for ${w.hostname} updated`);
  } else {
    app = await ctx.api("POST", `${acct(ctx)}/access/apps`, body, { dryResult: { aud: "<access_aud>" } });
    ctx.log(`done  Access application for ${w.hostname} created`);
  }
  return (app && app.aud) || "";
}

// ---------- Workers ----------
export function writeGenerated(ctx, cfg, app, extraVars = {}) {
  const conf = renderWrangler(cfg, app, ctx.accountId);
  Object.assign(conf.vars, extraVars);
  const file = join(APP_DIR[app], GENERATED);
  if (ctx.dryRun) {
    // Print with the account id masked; nothing is written.
    const shown = { ...conf, ...(conf.account_id ? { account_id: "$CLOUDFLARE_ACCOUNT_ID" } : {}) };
    ctx.log(`[dry-run] would write ${file.slice(ROOT.length + 1)}:\n${JSON.stringify(shown, null, 2)}`);
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(conf, null, 2) + "\n");
  }
  return file;
}

export async function deployWorkers(ctx, cfg, { accessAud = "", only = null } = {}) {
  if (!only || only === "email") {
    writeGenerated(ctx, cfg, "email");
    ctx.wrangler(["deploy", "-c", GENERATED], { cwd: APP_DIR.email });
    ctx.log(`done  deployed ${cfg.workers.email}`);
  }
  if (cfg.webInbox.enabled && (!only || only === "web")) {
    const aud = accessAud || cfg.webInbox.access.aud || "";
    if (cfg.webInbox.access.enabled && !aud) ctx.log("warn  ACCESS_AUD unknown: run `scripts/setup.sh` (or set webInbox.access.aud) to enable in-Worker JWT checks");
    writeGenerated(ctx, cfg, "web", aud ? { ACCESS_AUD: aud } : {});
    ctx.wrangler(["deploy", "-c", GENERATED], { cwd: APP_DIR.web });
    ctx.log(`done  deployed ${cfg.workers.web}` + (cfg.webInbox.hostname ? ` at https://${cfg.webInbox.hostname}` : ""));
  }
}

// Secrets come from the environment (or webhook.url in the gitignored config) and are piped to
// `wrangler secret put` on stdin, so they never appear in argv, logs or shell history.
export function putSecrets(ctx, cfg) {
  const url = ctx.env.NOTIFY_URL || cfg.webhook.url || "";
  const auth = ctx.env.NOTIFY_AUTH || "";
  if (!url) {
    ctx.log(cfg.deploy.keepVars
      ? "skip  NOTIFY_URL not provided; any NOTIFY_URL/NOTIFY_AUTH already on the worker (var or secret) is left as-is"
      : "skip  NOTIFY_URL not provided (no webhook; every message gets a failed/ notify_unset record)");
    return;
  }
  if (!/^https:\/\//.test(url)) throw new Error("NOTIFY_URL must start with https://");
  if (!ctx.dryRun) writeGenerated(ctx, cfg, "email");
  ctx.wrangler(["secret", "put", "NOTIFY_URL", "-c", GENERATED], { cwd: APP_DIR.email, input: url, inputLabel: "$NOTIFY_URL (hidden)" });
  if (auth) ctx.wrangler(["secret", "put", "NOTIFY_AUTH", "-c", GENERATED], { cwd: APP_DIR.email, input: auth, inputLabel: "$NOTIFY_AUTH (hidden)" });
  ctx.log("done  webhook secrets set" + (auth ? " (NOTIFY_URL, NOTIFY_AUTH)" : " (NOTIFY_URL)"));
}

// ---------- drop list / fetch ----------
export async function droplistSync(ctx, cfg, file) {
  const { compileDropList } = await import("../../apps/email-worker/src/index.js");
  if (!existsSync(file)) throw new Error(`drop list not found: ${file}`);
  const doc = JSON.parse(readFileSync(file, "utf8"));
  compileDropList(doc); // throws on a malformed document
  const counts = ["senders", "domains", "subjects"].map((k) => `${((doc.drop || {})[k] || []).length} ${k}`).join(", ");
  ctx.wrangler(["r2", "object", "put", `${cfg.bucket}/config/droplist.json`, "--file", file,
    "--content-type", "application/json", "--remote"], { cwd: ROOT });
  ctx.log(`done  uploaded drop list (${counts}); workers pick it up within 5 minutes`);
}

// Upload every file under <privateDir>/r2/ to the same key in R2. Only config/ keys are allowed,
// so an overlay can never overwrite mail or status records.
export function overlayFiles(dir) {
  const base = join(dir, "r2");
  if (!existsSync(base)) return [];
  const out = [];
  (function walk(d) {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out.push({ file: p, key: relative(base, p).split(sep).join("/") });
    }
  })(base);
  return out;
}
export async function overlaySync(ctx, cfg) {
  const dir = cfg._privateDir;
  if (!dir) throw new Error("no private overlay: set privateDir in the config or export R2_INBOX_PRIVATE_DIR");
  const files = overlayFiles(dir);
  if (!files.length) { ctx.log(`skip  nothing under ${join(dir, "r2")}`); return; }
  for (const { key } of files) if (!/^config\/[A-Za-z0-9._-]+\.json$/.test(key)) throw new Error(`overlay key not allowed (only config/*.json): ${key}`);
  for (const { file, key } of files) {
    const doc = JSON.parse(readFileSync(file, "utf8"));
    if (key === "config/droplist.json") {
      const { compileDropList } = await import("../../apps/email-worker/src/index.js");
      compileDropList(doc);
    }
    ctx.wrangler(["r2", "object", "put", `${cfg.bucket}/${key}`, "--file", file, "--content-type", "application/json", "--remote"], { cwd: ROOT });
    ctx.log(`done  ${key}`);
  }
}

export function keyFromId(id) {
  const s = String(id || "").trim().replace(/\.eml$/i, "");
  if (/^inbound\/\d{4}\/\d{2}\/\d{2}\/[^/]+$/.test(s)) return s + ".eml";
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T\d{9}Z-[0-9a-f]{16}$/);
  return m ? `inbound/${m[1]}/${m[2]}/${m[3]}/${s}.eml` : null;
}
export function messageIdHash(messageId) {
  const id = String(messageId || "").trim().replace(/^<|>$/g, "");
  return createHash("sha256").update(id).digest("hex").slice(0, 16);
}

// Fetch by inbox ID / R2 key (no listing needed) or by Message-ID + date (lists that day's prefix).
export async function fetchMessage(ctx, cfg, { id, messageId, date, out }) {
  let key = id ? keyFromId(id) : null;
  if (id && !key) throw new Error("not a message ID (e.g. 20260101T120000000Z-0123456789abcdef) or inbound/... key");
  if (!key) {
    if (!messageId || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error("use --id <ID|key>, or --message-id <id> --date YYYY-MM-DD");
    const prefix = `inbound/${date.replaceAll("-", "/")}/`;
    const hash = messageIdHash(messageId);
    // Follow result_info.cursor: a busy day can exceed one page.
    let hit = null, cursor = "";
    for (let page = 0; page < 100 && !hit; page++) {
      const q = `prefix=${encodeURIComponent(prefix)}&per_page=1000` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const r = ctx.dryRun
        ? { result: await ctx.api("GET", `${acct(ctx)}/r2/buckets/${cfg.bucket}/objects?${q}`, undefined, { dryResult: [] }), info: null }
        : await ctx.api("GET", `${acct(ctx)}/r2/buckets/${cfg.bucket}/objects?${q}`, undefined, { withInfo: true });
      hit = (r.result || []).find((o) => String(o.key).endsWith(`-${hash}.eml`)) || null;
      cursor = r.info && r.info.is_truncated && r.info.cursor ? r.info.cursor : "";
      if (!cursor) break;
    }
    if (!hit) { if (ctx.dryRun) return null; throw new Error(`no message with that Message-ID under ${prefix}`); }
    key = hit.key;
  }
  const dest = out || key.split("/").pop();
  ctx.wrangler(["r2", "object", "get", `${cfg.bucket}/${key}`, "--file", dest, "--remote"], { cwd: process.cwd() });
  ctx.log(`done  ${key} -> ${dest}`);
  return key;
}

// ---------- teardown ----------
export async function teardown(ctx, cfg, zone, { deleteBucket = false, deleteAccess = false } = {}) {
  const base = `/zones/${zone.id}/email/routing/rules`;
  const cur = await ctx.api("GET", `${base}/catch_all`, undefined, { dryResult: { actions: [{ type: "worker", value: [cfg.workers.email] }] } });
  if (cur && (cur.actions || []).some((a) => a.type === "worker" && (a.value || []).includes(cfg.workers.email))) {
    await ctx.api("PUT", `${base}/catch_all`, { name: "catch-all", enabled: false, matchers: [{ type: "all" }], actions: [{ type: "drop" }] });
    ctx.log("done  catch-all reset to disabled/drop");
  }
  const rules = (await ctx.api("GET", `${base}?per_page=50`, undefined, { dryResult: [] })) || [];
  for (const r of rules.filter((x) => String(x.name || "").startsWith(`${RULE_TAG}:`) && !(x.matchers || []).some((m) => m.type === "all"))) {
    await ctx.api("DELETE", `${base}/${r.id || r.tag}`);
    ctx.log(`done  deleted routing rule "${r.name}"`);
  }
  for (const app of ["web", "email"]) {
    const name = app === "web" ? cfg.workers.web : cfg.workers.email;
    try { ctx.wrangler(["delete", "--name", name, "--force"], { cwd: APP_DIR[app] }); ctx.log(`done  deleted worker ${name}`); }
    catch (err) { ctx.log(`warn  could not delete ${name}: ${err.message}`); }
  }
  if (deleteAccess && cfg.webInbox.hostname) {
    const apps = (await ctx.api("GET", `${acct(ctx)}/access/apps?per_page=100`, undefined, { dryResult: [{ id: "<access_app_id>", domain: cfg.webInbox.hostname }] })) || [];
    for (const a of apps.filter((x) => String(x.domain || "").toLowerCase() === cfg.webInbox.hostname.toLowerCase())) {
      await ctx.api("DELETE", `${acct(ctx)}/access/apps/${a.id}`);
      ctx.log(`done  deleted Access application for ${cfg.webInbox.hostname}`);
    }
  }
  if (deleteBucket) {
    // R2 refuses to delete a non-empty bucket; empty it yourself first (this is deliberate).
    await ctx.api("DELETE", `${acct(ctx)}/r2/buckets/${cfg.bucket}`);
    ctx.log(`done  deleted R2 bucket ${cfg.bucket}`);
  } else ctx.log(`keep  R2 bucket ${cfg.bucket} (pass --delete-bucket to remove it; it must be empty)`);
  ctx.log("note  Email Routing itself and its DNS records are left enabled; disable in the dashboard if you are leaving.");
}
