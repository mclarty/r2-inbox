// Preflight checks. Read-only: doctor never changes anything.
import { spawnSync } from "node:child_process";
import { findZone, ROOT } from "./steps.mjs";

export async function doctor(ctx, cfg, { fetcher = globalThis.fetch, spawn = spawnSync } = {}) {
  const results = [];
  const rec = (ok, name, detail = "") => { results.push({ ok, name, detail }); ctx.log(`${ok === true ? "ok  " : ok === null ? "info" : "FAIL"}  ${name}${detail ? " - " + detail : ""}`); };
  const acct = `/accounts/${ctx.accountId || "$CLOUDFLARE_ACCOUNT_ID"}`;

  const major = Number(process.versions.node.split(".")[0]);
  rec(major >= 22, "node >= 22 (wrangler 4 requirement; tests run on 20+)", process.versions.node);
  const w = spawn("npx", ["--no-install", "wrangler", "--version"], { cwd: ROOT, encoding: "utf8" });
  const wv = ((w.stdout || "").match(/\d+\.\d+\.\d+/) || [""])[0];
  const werr = ((w.stderr || "") + (w.stdout || "")).match(/requires at least Node\.js v[\d.]+/);
  rec(!!wv && Number(wv.split(".")[0]) >= 4, "wrangler >= 4 runnable (npm install)", wv || (werr ? werr[0] : "not found"));
  rec(!!ctx.token || ctx.dryRun, "CLOUDFLARE_API_TOKEN set", ctx.token ? "present (not shown)" : ctx.dryRun ? "dry-run" : "missing");
  rec(/^[0-9a-f]{32}$/.test(ctx.accountId) || ctx.dryRun, "CLOUDFLARE_ACCOUNT_ID set", ctx.accountId ? "present (not shown)" : ctx.dryRun ? "dry-run" : "missing");
  if (!ctx.dryRun && (!ctx.token || !ctx.accountId)) return results;

  const probe = async (name, fn) => {
    try { const d = await fn(); rec(d === false ? false : true, name, typeof d === "string" ? d : ""); return d; }
    catch (err) { rec(false, name, err.status === 403 ? "token lacks permission (403)" : err.message); return undefined; }
  };

  await probe("token is valid", async () => {
    let r;
    try { r = await ctx.api("GET", "/user/tokens/verify", undefined, { dryResult: { status: "active" } }); }
    catch { r = await ctx.api("GET", `${acct}/tokens/verify`, undefined, { dryResult: { status: "active" } }); }
    return r && r.status === "active" ? "active" : false;
  });
  const zone = await probe(`zone ${cfg.domain} found (Zone:Read)`, async () => findZone(ctx, cfg));
  await probe("Workers Scripts readable (Workers Scripts)", async () => { await ctx.api("GET", `${acct}/workers/scripts`, undefined, { dryResult: [] }); return true; });
  await probe(`R2 bucket ${cfg.bucket} exists (Workers R2 Storage)`, async () => {
    const b = await ctx.api("GET", `${acct}/r2/buckets/${cfg.bucket}`, undefined, { allow404: true, dryResult: { name: cfg.bucket } });
    return b ? true : false;
  });
  await probe(`R2 bucket ${cfg.bucket} has no public r2.dev URL`, async () => {
    const m = await ctx.api("GET", `${acct}/r2/buckets/${cfg.bucket}/domains/managed`, undefined, { allow404: true, dryResult: { enabled: false } });
    return m && m.enabled ? false : true;
  });
  if (zone && zone.id) {
    await probe(`Email Routing enabled on ${cfg.domain} (Email Routing Rules)`, async () => {
      const s = await ctx.api("GET", `/zones/${zone.id}/email/routing`, undefined, { dryResult: { enabled: true, status: "ready" } });
      return s && s.enabled ? String(s.status || "enabled") : false;
    });
    if (cfg.routing.mode === "catch_all") {
      await probe(`catch-all routes to worker ${cfg.workers.email}`, async () => {
        const r = await ctx.api("GET", `/zones/${zone.id}/email/routing/rules/catch_all`, undefined, { dryResult: { enabled: true, actions: [{ type: "worker", value: [cfg.workers.email] }] } });
        const ok = r && r.enabled && (r.actions || []).some((a) => a.type === "worker" && (a.value || []).includes(cfg.workers.email));
        return ok ? true : false;
      });
    }
  }
  if (cfg.webInbox.enabled && cfg.webInbox.access.enabled) {
    await probe(`Access application protects ${cfg.webInbox.hostname} (Access: Apps and Policies)`, async () => {
      const apps = await ctx.api("GET", `${acct}/access/apps?per_page=100`, undefined, { dryResult: [{ domain: cfg.webInbox.hostname }] }) || [];
      return apps.some((a) => String(a.domain || "").toLowerCase() === cfg.webInbox.hostname.toLowerCase()) ? true : false;
    });
  }
  if (cfg.webInbox.enabled && cfg.webInbox.hostname) {
    const url = `https://${cfg.webInbox.hostname}/api/messages`;
    if (ctx.dryRun) { ctx.log(`[dry-run] curl -sS -o /dev/null -w '%{http_code}' ${url}`); rec(null, "web inbox reachable", "skipped (dry-run)"); }
    else await probe(`web inbox reachable at https://${cfg.webInbox.hostname}`, async () => {
      const r = await fetcher(url, { redirect: "manual" });
      if (cfg.webInbox.access.enabled) {
        // Unauthenticated requests must be stopped by Access (302 to login, or 401/403), never 200.
        if ([302, 401, 403].includes(r.status)) return `HTTP ${r.status} (Access is gating)`;
        throw new Error(r.status === 200 ? "HTTP 200 WITHOUT AUTH: Access is not protecting this hostname" : `unexpected HTTP ${r.status}`);
      }
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
      return `HTTP ${r.status}`;
    });
  }
  const failed = results.filter((r) => r.ok === false).length;
  ctx.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
  return results;
}
