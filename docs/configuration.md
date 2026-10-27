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

Binding: R2 `INBOUND`.

## Web inbox vars

| Var | Meaning |
|---|---|
| `BUCKET_NAME` | shown in the UI |
| `ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` |
| `ACCESS_AUD` | Access application AUD; with the team domain enables JWT verification |

Binding: R2 `MAIL`.
