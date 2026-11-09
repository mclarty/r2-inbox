# Configuration

Deploy-time settings: `r2-inbox.config.json` (see README → Configuration reference). The scripts translate it into
Worker vars; you can also set these directly when running the workers some other way.

## Email worker vars

| Var | Example | Meaning |
|---|---|---|
| `ACCEPT_RECIPIENTS` | `you@example.com,you+*@example.com,*@sub.example.com` | envelope-recipient globs; empty = accept all |
| `SELF_DOMAINS` | `example.com` | own domains (subdomains included) for spoof detection |
| `NEVER_DROP` | `bank.example` | sender domains never dropped (plus `never_drop` in the drop list) |
| `REJECT_DROPPED` | `true` | SMTP-reject drop-listed senders after archiving |
| `NOTIFY_RETRY_DELAYS_MS` | `0,5000,15000` | webhook attempt delays (max 10 attempts, each ≤ 120000) |
| `NOTIFY_URL` *(secret)* | `https://…` | webhook endpoint |
| `NOTIFY_AUTH` *(secret)* | `Bearer …` | sent as `Authorization` |
| `UNSUBSCRIBE_ON_DROP` | `false` | when `true`/`1`/`on`, droplist drops that authenticate and expose an unsubscribe mechanism also POST an `unsubscribe_request` to the webhook (default **off**) |

Binding: R2 `INBOUND`.

## Web inbox vars

| Var | Meaning |
|---|---|
| `BUCKET_NAME` | shown in the UI |
| `ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` |
| `ACCESS_AUD` | Access application AUD; with the team domain enables JWT verification |
| `MAIL_FROM` | Permitted From address when outbound mail is enabled. Empty leaves sending off. |
| `MAIL_FROM_NAME` | Optional display name for that sender. |
| `MAIL_REPLY_TO` | Optional Reply-To. The compose form cannot set a different one. |
| `MAIL_OWN_ADDRESSES` | Comma-separated identities reply-all must skip. |
| `EMAIL_ACCOUNT_ID` | Account id used in the Email Sending URL. Deploy copies `$CLOUDFLARE_ACCOUNT_ID` here. Not a secret, but not something to commit. |
| `EMAIL_API_TOKEN` | **Secret.** API token with only Account → Email Sending → Edit. Installed by `secrets` when `outbound.enabled` is true. |
| `EMAIL_ZONE_ID` | Zone id for Sent activity. From `outbound.zoneId`. Not required to send. |
| `EMAIL_ANALYTICS_TOKEN` | **Secret.** Zone Analytics Read token for Sent. Separate from the send token. |
| `EMAIL_ACTIVITY_LOG_BASE` | Optional dashboard activity-log prefix from `outbound.activityLogBase`. Empty disables Open in Cloudflare. |

Binding: R2 `MAIL`.

Outbound mail is optional. See [outbound.md](outbound.md) for the private-config steps. The public example leaves it disabled. Send claims are objects under `outbound/sends/` in this same bucket. Do not expire that prefix.
