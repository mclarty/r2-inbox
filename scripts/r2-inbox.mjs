#!/usr/bin/env node
// r2-inbox CLI. Usage: node scripts/r2-inbox.mjs <command> [options]   (see --help)
//
// Credentials come only from the environment:
//   CLOUDFLARE_API_TOKEN   API token (see README "API token permissions")
//   CLOUDFLARE_ACCOUNT_ID  32-hex account id
//   NOTIFY_URL, NOTIFY_AUTH  optional webhook secrets for the email worker
// Nothing secret is printed. --dry-run prints every API call / wrangler command instead of running it.
import { createInterface } from "node:readline/promises";
import { loadConfig } from "./lib/config.mjs";
import { createContext, requireEnv } from "./lib/cf.mjs";
import * as steps from "./lib/steps.mjs";
import { doctor } from "./lib/doctor.mjs";

const HELP = `r2-inbox - set up and operate a Cloudflare Email Routing -> Worker -> R2 mailbox

Usage: node scripts/r2-inbox.mjs <command> [options]

Commands:
  doctor             Preflight checks (read-only)
  setup              End to end: bucket, lifecycle, Email Routing + DNS, Access, deploy, secrets, routing rule
  deploy [email|web] Deploy both workers (or one)
  routing [--force]  Create/update the Email Routing rule(s) -> email worker (--force re-saves them)
  secrets            Set NOTIFY_URL / NOTIFY_AUTH from the environment
  access             Create/update the Cloudflare Access application for the web inbox
  droplist-sync [FILE] Validate FILE (default <privateDir>/droplist.json) and upload it as config/droplist.json
  overlay-sync       Upload <privateDir>/r2/config/*.json to the same R2 keys (validates droplist.json)
  fetch              Download a message: --id <ID|inbound/... key> | --message-id <id> --date YYYY-MM-DD  [--out FILE]
  teardown           Remove routing rules and workers (asks first). --delete-access, --delete-bucket, --yes
  print-config       Show the validated config with defaults applied

Options:
  --config FILE   config path (default: $R2_INBOX_CONFIG, $R2_INBOX_PRIVATE_DIR/r2-inbox.config.json, ./r2-inbox.config.json)
  --dry-run       print the exact calls; no network, no wrangler, no files written
  --verbose       log each call as it runs
  -h, --help
`;

export function parseArgs(argv) {
  const o = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.flags.help = true;
    else if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) o.flags[k] = v;
      else if (["config", "id", "message-id", "date", "out"].includes(k)) o.flags[k] = argv[++i];
      else o.flags[k] = true;
    } else o._.push(a);
  }
  return o;
}

async function confirm(ctx, question, expected) {
  if (ctx.yes || ctx.dryRun) return true;
  if (!process.stdin.isTTY) throw new Error("refusing to continue without a TTY; pass --yes to confirm");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = (await rl.question(`${question} Type "${expected}" to continue: `)).trim();
  rl.close();
  return ans === expected;
}

export async function main(argv, opts = {}) {
  const { _: [cmd, arg], flags } = parseArgs(argv);
  const log = opts.log || console.log;
  if (!cmd || flags.help) { log(HELP); return 0; }
  const cfg = loadConfig(flags.config, opts.env || process.env);
  const ctx = createContext({ dryRun: !!flags["dry-run"], yes: !!flags.yes, verbose: !!flags.verbose, ...opts });
  if (ctx.dryRun) ctx.log("# dry-run: nothing below is executed; $CLOUDFLARE_API_TOKEN / $CLOUDFLARE_ACCOUNT_ID are not printed\n");

  switch (cmd) {
    case "print-config": { const { _path, ...c } = cfg; log(JSON.stringify(c, null, 2)); return 0; }
    case "doctor": {
      const r = await doctor(ctx, cfg, opts);
      return r.some((x) => x.ok === false) ? 1 : 0;
    }
    case "setup": {
      requireEnv(ctx);
      const zone = await steps.findZone(ctx, cfg);
      ctx.log(`ok    zone ${cfg.domain}`);
      await steps.ensureBucket(ctx, cfg);
      await steps.ensureLifecycle(ctx, cfg);
      const aud = await steps.ensureAccess(ctx, cfg);
      await steps.deployWorkers(ctx, cfg, { accessAud: aud });
      steps.putSecrets(ctx, cfg);
      await steps.ensureEmailRouting(ctx, cfg, zone);
      await steps.ensureRouting(ctx, cfg, zone, { force: true });
      ctx.log("\nSetup complete. Next: `scripts/doctor.sh`, then send a test message to your address.");
      if (aud && !ctx.dryRun && !cfg.webInbox.access.aud) ctx.log(`tip   add "aud": "${aud}" under webInbox.access in your config so later deploys keep JWT checks on.`);
      return 0;
    }
    case "deploy": {
      requireEnv(ctx);
      if (arg && !["email", "web"].includes(arg)) throw new Error("deploy target must be email or web");
      await steps.deployWorkers(ctx, cfg, { only: arg || null });
      if (!arg || arg === "email") ctx.log("note  if you renamed the email worker, run `scripts/routing.sh --force` (rules store the name as text)");
      return 0;
    }
    case "routing": {
      requireEnv(ctx);
      const zone = await steps.findZone(ctx, cfg);
      await steps.ensureEmailRouting(ctx, cfg, zone);
      await steps.ensureRouting(ctx, cfg, zone, { force: !!flags.force });
      return 0;
    }
    case "secrets": requireEnv(ctx); steps.putSecrets(ctx, cfg); return 0;
    case "access": { requireEnv(ctx); const aud = await steps.ensureAccess(ctx, cfg); if (aud) ctx.log(`AUD   ${aud}  (set webInbox.access.aud, then deploy web)`); return 0; }
    case "droplist-sync": {
      const file = arg || (cfg._privateDir ? `${cfg._privateDir}/droplist.json` : "");
      if (!file) throw new Error("usage: droplist-sync path/to/droplist.json (or set privateDir / R2_INBOX_PRIVATE_DIR)");
      requireEnv(ctx, { needAccount: false });
      await steps.droplistSync(ctx, cfg, file);
      return 0;
    }
    case "overlay-sync": requireEnv(ctx, { needAccount: false }); await steps.overlaySync(ctx, cfg); return 0;
    case "fetch": {
      requireEnv(ctx);
      await steps.fetchMessage(ctx, cfg, { id: flags.id, messageId: flags["message-id"], date: flags.date, out: flags.out });
      return 0;
    }
    case "teardown": {
      requireEnv(ctx);
      const what = `routing rules for ${cfg.domain}, workers ${cfg.workers.email} and ${cfg.workers.web}` +
        (flags["delete-access"] ? ", the Access application" : "") + (flags["delete-bucket"] ? `, and the R2 bucket ${cfg.bucket}` : "");
      ctx.log(`This removes ${what}.`);
      if (!(await confirm(ctx, "Mail to this domain will stop being stored.", cfg.domain))) { ctx.log("aborted"); return 1; }
      const zone = await steps.findZone(ctx, cfg);
      await steps.teardown(ctx, cfg, zone, { deleteBucket: !!flags["delete-bucket"], deleteAccess: !!flags["delete-access"] });
      return 0;
    }
    default: log(HELP); throw new Error(`unknown command: ${cmd}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    console.error(`error: ${err.message}`);
    process.exit(1);
  });
}
