# Architecture

Two Workers share one private R2 bucket. There is no database, queue or KV: R2 object keys are the index.

## Ingest (apps/email-worker)

`email(message, env)` runs for each message routed to the worker:

1. Read the raw stream once into memory (Email Routing caps messages at 25 MiB).
2. Compute the auth verdict from the topmost `Authentication-Results` (authserv `mx.cloudflare.net`).
3. `put inbound/YYYY/MM/DD/<ts>-<hash>.eml` with custom metadata (kept < 2 KB). On failure: **throw** → SMTP temporary failure/bounce.
4. Recipient filter (`ACCEPT_RECIPIENTS`). No match → `dropped/…json` `{dropped:"recipient"}` → done.
5. Drop list (`config/droplist.json`, 5-minute in-memory cache, fail-open). Match → `dropped/…json`; if `REJECT_DROPPED` and the
   list does not disable it → `setReject("550 5.7.1 …")`.
6. Webhook `POST NOTIFY_URL` with `{key, from, subject, date, messageId, auth_verdict, dkim_domain, spf_result, dmarc_result, self_spoof_suspect}`.
   Retries transient statuses with backoff (`NOTIFY_RETRY_DELAYS_MS`, default 0/5/15/30/60 s). Final failure → `failed/…json`.

The key's `<ts>-<hash>` part is the **Message ID** shown in the inbox; `hash = sha256(Message-ID without <>)[:16]`.

## Viewer (apps/web-inbox)

| Route | Purpose |
|---|---|
| `GET /` | single-page app (inline HTML/CSS/JS, no external assets) |
| `GET /api/messages?offset&limit&q&refresh` | list built from `bucket.list("inbound/")` plus status records, cached briefly |
| `GET /api/message?key` | parsed message: headers, addresses, attachments, statuses |
| `GET /body?key&images=0/1` | sanitized HTML (or escaped text) for the sandboxed iframe |
| `GET /part?key&i&download` | attachment bytes with safe content-type/disposition |
| `POST /api/delete` | `{key}` → deletes `.eml` + matching `dropped/`/`failed/` records |

Every request first passes `requireAccess` (no-op unless `ACCESS_TEAM_DOMAIN` + `ACCESS_AUD` are set).

## Scripts

`scripts/r2-inbox.mjs` → `lib/config.mjs` (load/validate/render), `lib/cf.mjs` (REST + wrangler with dry-run and redaction),
`lib/steps.mjs` (idempotent operations), `lib/doctor.mjs` (read-only checks).
