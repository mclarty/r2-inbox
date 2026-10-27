# Deploying from a private config

Goal: run the public code **as is** (a plain clone or a pinned tag, not a fork) against your own existing
Cloudflare environment, with every private value living outside the repository.

## Layout

```
~/src/r2-inbox/                 # public clone, never edited (git pull to upgrade)
~/r2-inbox-private/             # private, its own (private) git repo or just a folder
├── r2-inbox.config.json        # your domain, bucket, worker names, recipients, Access settings
├── droplist.json               # your drop list (scripts/droplist-sync uses it by default)
├── r2/
│   └── config/
│       ├── droplist.json       # optional: anything here is uploaded to the same R2 key by overlay-sync
│       └── unsubscribed.json   # optional: drives Unsubscribed pills
└── .envrc                      # optional: exports CLOUDFLARE_ACCOUNT_ID (load the token from a password manager)
```

Point the scripts at it with `export R2_INBOX_PRIVATE_DIR=~/r2-inbox-private`, or pass
`--config ~/r2-inbox-private/r2-inbox.config.json`. Resolution order: `--config`, `$R2_INBOX_CONFIG`,
`$R2_INBOX_PRIVATE_DIR/r2-inbox.config.json`, `./r2-inbox.config.json` (gitignored). Generated wrangler configs
(`apps/*/.wrangler.generated.json`) are gitignored and contain only what your config says.

Rules:

- No private value is ever hard-coded in the repo: names, bucket, domain, recipients and hostnames all come from the config.
- `overlay-sync` uploads only `config/*.json` keys, and validates `droplist.json` with the worker's own compiler first.
- Secrets (`NOTIFY_URL`, `NOTIFY_AUTH`) come from the environment, not from the overlay.
- If an existing worker has `NOTIFY_URL` as a plain **var** (not a secret), keep `deploy.keepVars: true` and don't run
  `secrets` for it: `wrangler secret put` refuses a name already bound as a var. To convert, delete the var in the dashboard
  and run `secrets` right away (messages in between get a `failed/` notify record).
- `fetch --message-id … --date` uses the **UTC** arrival date (keys are `inbound/YYYY/MM/DD` in UTC).

## Adopting existing workers and buckets

Example config for an environment that already exists:

```json
{
  "domain": "example.org",
  "bucket": "existing-mail-bucket",
  "workers": { "email": "existing-email-worker", "web": "existing-inbox" },
  "routing": { "mode": "none" },
  "acceptRecipients": ["me@example.org", "me+*@example.org", "*@me.example.org"],
  "selfDomains": ["example.org"],
  "rejectDropped": true,
  "deploy": { "keepVars": true },
  "privateDir": ".",
  "webInbox": { "enabled": true, "hostname": "", "workersDev": true,
    "access": { "enabled": false } }
}
```

- `routing.mode: "none"`: the scripts never touch your live routing rules. Switch to `catch_all`/`addresses` only when you want them to manage routing.
- `deploy.keepVars: true`: vars you set in the dashboard aren't wiped on deploy. Secrets are always preserved by wrangler.
- `webInbox.workersDev: true` + `access.enabled: false` mirrors a setup where Access was enabled in the dashboard for **all traffic** of the worker. Set `access.teamDomain` and `access.aud` (with `enabled: true`) if you want the in-Worker JWT check as well. Leave `hostname` empty to avoid attaching a custom domain.
- Keep the same worker **names**. Email Routing rules point at a worker by name, so deploying under the same name means routing keeps working without changes.

## Cutover plan (from a hand-maintained private deployment)

Nothing here runs automatically. Each step is reversible until step 7.

1. **Inventory.** Record the current worker names, bucket, routing rules (catch-all/addresses → which worker), vars and
   secret *names* (`wrangler secret list`), Access app, and whether `workers.dev` is used. Back up the current
   drop list object (`fetch-message` style: `npx wrangler r2 object get <bucket>/config/droplist.json --file ... --remote`).
2. **Write the private config** with exactly those values (as above, `routing.mode: "none"`).
3. **Diff before deploy.** Run `scripts/deploy.sh --dry-run` and compare the rendered `vars`, bindings and names against
   the inventory. Map any old hard-coded behaviour to config: recipient rules → `acceptRecipients`, own domains → `selfDomains`,
   always-allowed partner domains → `neverDrop`.
4. **Test locally.** `npm test`. Optionally add a private test with your real drop list in the overlay (never commit it here).
5. **Deploy the web inbox first** (`scripts/deploy.sh web`): it is read-only plus delete, and easy to verify in the browser.
6. **Deploy the email worker** (`scripts/deploy.sh email`) under the **same name**. Send test messages: normal, drop-listed,
   unknown recipient. Check `inbound/`, `dropped/`, `failed/` and the webhook. `scripts/doctor` should be green.
7. **Rollback** if needed: redeploy the previous version from the old repo (`wrangler deploy` there), or use
   `wrangler rollback` for the worker. Routing was never changed, so rollback is just a deploy.
8. **Optional later:** let the scripts manage routing (`routing.mode`) and Access (`access.enabled`) once you're comfortable.
   If a rename is ever involved, run `scripts/routing.sh --force` and keep the old worker around for a few days
   (see README → Troubleshooting).
