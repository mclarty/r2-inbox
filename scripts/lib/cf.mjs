// Minimal Cloudflare REST + wrangler runner with a strict --dry-run mode.
//
// - The API token is read from CLOUDFLARE_API_TOKEN and only ever placed in the
//   Authorization header. It is never printed, logged or written to disk.
// - In dry-run mode no network request and no wrangler command is executed. Every
//   call that *would* run is printed as an equivalent curl / wrangler command that
//   references $CLOUDFLARE_API_TOKEN and $CLOUDFLARE_ACCOUNT_ID instead of values.
import { spawnSync } from "node:child_process";

export const API = "https://api.cloudflare.com/client/v4";

export class CfError extends Error {
  constructor(message, status, errors) { super(message); this.status = status; this.errors = errors || []; }
}

export function redact(text, secrets) {
  let s = String(text);
  for (const v of secrets) if (v && v.length >= 6) s = s.split(v).join("***");
  return s;
}

export function createContext({ dryRun = false, env = process.env, log = console.log, fetcher = globalThis.fetch,
  spawn = spawnSync, yes = false, verbose = false } = {}) {
  const token = env.CLOUDFLARE_API_TOKEN || "";
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || "";
  const secrets = [token, env.NOTIFY_URL, env.NOTIFY_AUTH].filter(Boolean);
  const out = (msg) => log(redact(dryRun ? String(msg).replace(/^done  /, "plan  ") : msg, secrets));
  const planned = [];

  // Replace the real account id in printed paths with a variable reference.
  const show = (path) => (accountId ? path.split(accountId).join("$CLOUDFLARE_ACCOUNT_ID") : path);

  async function api(method, path, body, { allow404 = false, dryResult = null } = {}) {
    const url = API + path;
    if (dryRun) {
      const data = body === undefined ? "" : ` \\\n    -H 'Content-Type: application/json' --data '${JSON.stringify(body)}'`;
      const line = `curl -sS -X ${method} "${API}${show(path)}" \\\n    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"${data}`;
      planned.push({ kind: "api", method, path: show(path), body });
      out(`[dry-run] ${line}`);
      return dryResult;
    }
    if (!token) throw new CfError("CLOUDFLARE_API_TOKEN is not set", 0);
    if (verbose) out(`-> ${method} ${show(path)}`);
    const res = await fetcher(url, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 404 && allow404) return null;
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok || (json && json.success === false)) {
      const errs = (json && json.errors) || [];
      const msg = errs.map((x) => `${x.code}: ${x.message}`).join("; ") || `HTTP ${res.status}`;
      throw new CfError(redact(`${method} ${show(path)} failed: ${msg}`, secrets), res.status, errs);
    }
    return json ? json.result : null;
  }

  // Run wrangler (from the repo's node_modules). `input` is piped to stdin (used for secrets).
  function wrangler(args, { cwd, input, inputLabel, capture = false } = {}) {
    const printable = `npx wrangler ${args.join(" ")}` + (inputLabel ? `  # stdin: ${inputLabel}` : "");
    if (dryRun) {
      planned.push({ kind: "wrangler", args, cwd });
      out(`[dry-run] (cd ${cwd || "."} && ${printable})`);
      return { status: 0, stdout: "" };
    }
    if (verbose) out(`-> ${printable}`);
    const r = spawn("npx", ["--no-install", "wrangler", ...args], {
      cwd, input, encoding: "utf8", env: { ...env, WRANGLER_SEND_METRICS: "false" },
      stdio: [input === undefined ? "inherit" : "pipe", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"],
    });
    if (r.error) throw r.error;
    if (r.status !== 0) {
      throw new CfError(`wrangler ${args[0]} ${args[1] || ""} exited with ${r.status}` +
        (capture ? `: ${redact((r.stderr || "").trim().slice(0, 500), secrets)}` : ""), r.status);
    }
    return r;
  }

  return { dryRun, yes, env, token, accountId, api, wrangler, log: out, planned, show };
}

export function requireEnv(ctx, { needAccount = true } = {}) {
  const missing = [];
  if (!ctx.token && !ctx.dryRun) missing.push("CLOUDFLARE_API_TOKEN");
  if (needAccount && !ctx.accountId && !ctx.dryRun) missing.push("CLOUDFLARE_ACCOUNT_ID");
  if (missing.length) throw new CfError(`missing environment variable(s): ${missing.join(", ")}`, 0);
  if (ctx.accountId && !/^[0-9a-f]{32}$/.test(ctx.accountId)) throw new CfError("CLOUDFLARE_ACCOUNT_ID must be 32 hex characters", 0);
}
