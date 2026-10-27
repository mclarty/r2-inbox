// Load and validate r2-inbox.config.json (the single source of deploy-time settings).
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

export const DEFAULTS = {
  bucket: "my-mail-bucket",
  workers: { email: "r2-inbox-email", web: "r2-inbox-web" },
  routing: { mode: "catch_all", addresses: [], enableEmailRouting: true },
  acceptRecipients: [],
  selfDomains: [],
  neverDrop: [],
  rejectDropped: false,
  webhook: { url: "" },
  lifecycle: { expireDays: 0 },
  // Private overlay directory (outside the repo) for drop lists and other R2 config objects.
  privateDir: "",
  deploy: { keepVars: false },
  webInbox: {
    enabled: true,
    workersDev: false,
    hostname: "",
    access: { enabled: true, teamDomain: "", allowEmails: [], sessionDuration: "24h", aud: "" },
  },
};

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const WORKER_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const BUCKET_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PATTERN_RE = /^[^@\s,]+@[^@\s,]+$/;

function merge(base, over) {
  if (Array.isArray(base) || typeof base !== "object" || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = k in base ? merge(base[k], v) : v;
  return out;
}

export function withDefaults(raw) {
  return merge(structuredClone(DEFAULTS), raw || {});
}

// Returns a list of human-readable problems; empty list = valid.
export function validateConfig(cfg) {
  const e = [];
  const arr = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (!cfg || typeof cfg !== "object") return ["config must be a JSON object"];
  if (!DOMAIN_RE.test(cfg.domain || "")) e.push("domain: must be a DNS name such as example.com");
  if (!BUCKET_RE.test(cfg.bucket || "")) e.push("bucket: 3-63 chars, lowercase letters, digits and hyphens");
  for (const k of ["email", "web"]) {
    if (!WORKER_RE.test((cfg.workers && cfg.workers[k]) || "")) e.push(`workers.${k}: lowercase letters, digits and hyphens (max 63)`);
  }
  if (cfg.workers && cfg.workers.email === cfg.workers.web) e.push("workers: email and web worker names must differ");
  const r = cfg.routing || {};
  if (!["catch_all", "addresses", "none"].includes(r.mode)) e.push('routing.mode: one of "catch_all", "addresses", "none"');
  if (!arr(r.addresses || [])) e.push("routing.addresses: array of strings");
  if (r.mode === "addresses") {
    if (!(r.addresses || []).length) e.push('routing.addresses: required when routing.mode is "addresses"');
    for (const a of r.addresses || []) {
      if (!EMAIL_RE.test(a)) e.push(`routing.addresses: "${a}" is not an email address`);
      else if (!a.toLowerCase().endsWith("@" + String(cfg.domain).toLowerCase())) e.push(`routing.addresses: "${a}" is not on ${cfg.domain}`);
    }
  }
  if (!arr(cfg.acceptRecipients)) e.push("acceptRecipients: array of strings");
  else for (const p of cfg.acceptRecipients) if (!PATTERN_RE.test(p)) e.push(`acceptRecipients: "${p}" must look like local@domain (\`*\` allowed)`);
  for (const k of ["selfDomains", "neverDrop"]) {
    if (!arr(cfg[k])) e.push(`${k}: array of domain names`);
    else for (const d of cfg[k]) if (!DOMAIN_RE.test(d)) e.push(`${k}: "${d}" is not a domain`);
  }
  if (typeof (cfg.deploy || {}).keepVars !== "boolean") e.push("deploy.keepVars: true or false");
  if (typeof (cfg.webInbox || {}).workersDev !== "boolean") e.push("webInbox.workersDev: true or false");
  if (typeof cfg.privateDir !== "string") e.push("privateDir: string path");
  if (typeof cfg.rejectDropped !== "boolean") e.push("rejectDropped: true or false");
  const url = (cfg.webhook && cfg.webhook.url) || "";
  if (url && !/^https:\/\//.test(url)) e.push("webhook.url: must start with https://");
  const days = cfg.lifecycle && cfg.lifecycle.expireDays;
  if (!Number.isInteger(days) || days < 0) e.push("lifecycle.expireDays: integer >= 0 (0 = keep forever)");
  const w = cfg.webInbox || {};
  if (w.enabled) {
    if (w.hostname && !DOMAIN_RE.test(w.hostname)) e.push("webInbox.hostname: must be a DNS name such as inbox.example.com");
    if (w.hostname && !(w.hostname === cfg.domain || w.hostname.endsWith("." + cfg.domain))) {
      e.push(`webInbox.hostname: must be on the zone ${cfg.domain} (or change domain)`);
    }
    const a = w.access || {};
    if (a.enabled) {
      if (!w.hostname) e.push("webInbox.access: requires webInbox.hostname");
      if (!DOMAIN_RE.test(a.teamDomain || "") || !/\.cloudflareaccess\.com$/i.test(a.teamDomain || "")) {
        e.push("webInbox.access.teamDomain: your Zero Trust team domain, e.g. myteam.cloudflareaccess.com");
      }
      if (!arr(a.allowEmails) || !a.allowEmails.length) e.push("webInbox.access.allowEmails: at least one email address");
      else for (const x of a.allowEmails) if (!EMAIL_RE.test(x)) e.push(`webInbox.access.allowEmails: "${x}" is not an email address`);
    }
  }
  return e;
}

// Config path resolution: --config, $R2_INBOX_CONFIG, $R2_INBOX_PRIVATE_DIR/r2-inbox.config.json,
// ./r2-inbox.config.json. A private overlay dir lets you deploy this repo unmodified with your own settings.
export function configPath(path, env = process.env) {
  if (path) return resolve(path);
  if (env.R2_INBOX_CONFIG) return resolve(env.R2_INBOX_CONFIG);
  if (env.R2_INBOX_PRIVATE_DIR) return resolve(env.R2_INBOX_PRIVATE_DIR, "r2-inbox.config.json");
  return resolve("r2-inbox.config.json");
}

export function loadConfig(path, env = process.env) {
  const p = configPath(path, env);
  if (!existsSync(p)) {
    throw new Error(`config not found: ${p}\n  cp r2-inbox.config.example.json r2-inbox.config.json  # then edit it`);
  }
  let raw;
  try { raw = JSON.parse(readFileSync(p, "utf8")); }
  catch (err) { throw new Error(`config ${p} is not valid JSON: ${err.message}`); }
  delete raw.$schema; delete raw._comment;
  const cfg = withDefaults(raw);
  const errors = validateConfig(cfg);
  if (errors.length) throw new Error(`config ${p} is invalid:\n  - ` + errors.join("\n  - "));
  cfg._path = p;
  // privateDir: explicit value (relative to the config file), else $R2_INBOX_PRIVATE_DIR, else the config's folder
  // when the config lives outside the repo.
  cfg._privateDir = cfg.privateDir ? resolve(dirname(p), cfg.privateDir) : (env.R2_INBOX_PRIVATE_DIR ? resolve(env.R2_INBOX_PRIVATE_DIR) : "");
  return cfg;
}

// Worker vars derived from config (non-secret).
export function emailWorkerVars(cfg) {
  return {
    ACCEPT_RECIPIENTS: cfg.acceptRecipients.join(","),
    SELF_DOMAINS: cfg.selfDomains.join(","),
    NEVER_DROP: cfg.neverDrop.join(","),
    REJECT_DROPPED: cfg.rejectDropped ? "true" : "false",
  };
}
export function webInboxVars(cfg) {
  const a = cfg.webInbox.access;
  return {
    BUCKET_NAME: cfg.bucket,
    ACCESS_TEAM_DOMAIN: a.enabled ? a.teamDomain : "",
    ACCESS_AUD: a.enabled ? (a.aud || "") : "",
  };
}

// Full wrangler config objects (rendered to apps/*/.wrangler.generated.json).
export function renderWrangler(cfg, app, accountId) {
  if (app === "email") {
    return {
      name: cfg.workers.email, main: "src/index.js", compatibility_date: "2026-10-01",
      ...(accountId ? { account_id: accountId } : {}),
      workers_dev: false, observability: { enabled: true }, keep_vars: !!cfg.deploy.keepVars,
      vars: emailWorkerVars(cfg),
      r2_buckets: [{ binding: "INBOUND", bucket_name: cfg.bucket }],
    };
  }
  const w = cfg.webInbox;
  return {
    name: cfg.workers.web, main: "src/index.js", compatibility_date: "2026-10-13",
    ...(accountId ? { account_id: accountId } : {}),
    workers_dev: !!w.workersDev, preview_urls: false, keep_vars: !!cfg.deploy.keepVars,
    vars: webInboxVars(cfg),
    r2_buckets: [{ binding: "MAIL", bucket_name: cfg.bucket }],
    ...(w.hostname ? { routes: [{ pattern: w.hostname, custom_domain: true }] } : {}),
  };
}
