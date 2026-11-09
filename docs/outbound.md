# Outbound mail

The web inbox can compose a message and send it through **Cloudflare Email Sending**. Reply, reply all, and forward reuse that same form. Nothing is sent until you press Send, and this repository never calls the live API during tests.

Inbound mail is unchanged. Sent messages are not written back to R2.

## What the provider accepts

Checked against the Cloudflare Email Service docs (REST API and [header reference](https://developers.cloudflare.com/email-service/reference/headers/), current as of November 2026):

| Need | Support |
|---|---|
| To, Cc, Bcc | `POST /accounts/{account_id}/email/sending/send` fields `to`, `cc`, and `bcc`. Each value is a string or `{ "address", "name" }`. Combined recipients: 50. |
| HTML and plain text | `html` and `text` on the same request. The worker sends both. |
| Threading | Allowlisted headers `In-Reply-To` and `References`. `From`, `To`, `Cc`, `Bcc`, `Subject`, and `Reply-To` must use the API fields. A `Bcc` header is rejected with `E_HEADER_USE_API_FIELD`. |
| Bcc privacy | Bcc is only the `bcc` field. It is not copied into `headers`, the HTML, the text part, or a reply draft. Cloudflare's SMTP docs describe Bcc as an envelope recipient that is omitted from the message headers; the structured API uses the same split. |
| Result | `delivered`, `queued`, `permanent_bounces`, and `message_id`. Queued is not treated as delivered. |

No second sending service is added. The worker calls this API with a secret token. Tests pass a mock fetcher and do not contact Cloudflare.

## Configure a private deployment

Do this in the private config and the Cloudflare dashboard. Do not put the token, account id, or real addresses in the public repo.

1. Onboard the sending domain under Email Service → Email Sending. Until that is done, Cloudflare only accepts mail to verified destination addresses. This repo does not call the onboarding API.
2. Create a token scoped to **one account** with only **Account → Email Sending → Edit**. Do not reuse the deploy token, and do not grant this token Workers, R2, or Access access.
3. In the private `r2-inbox.config.json`:

```json
"outbound": {
  "enabled": true,
  "from": "you@example.com",
  "fromName": "Your name",
  "replyTo": "you@example.com",
  "ownAddresses": ["you@example.com", "alias@example.net"]
}
```

`from` must be an address on the configured zone. `ownAddresses` are the mailboxes reply-all should skip (plus-addresses of an entry without a `+` tag are skipped too). The logged-in Access email is skipped as well when the worker checks the Access JWT.

4. Export the token in the shell you use for deploy. It is not a config key.

```bash
export EMAIL_API_TOKEN='...'   # read -rs EMAIL_API_TOKEN keeps it out of history
```

`CLOUDFLARE_ACCOUNT_ID` is already required. Deploy copies it into the non-secret worker var `EMAIL_ACCOUNT_ID`. Dry-run prints that value as `$CLOUDFLARE_ACCOUNT_ID`.

5. Preview, then deploy only the web worker and install the secret:

```bash
scripts/deploy.sh web --dry-run
scripts/deploy.sh web
node scripts/r2-inbox.mjs secrets
```

`secrets` writes `EMAIL_API_TOKEN` with `wrangler secret put` on stdin when outbound mail is enabled. It does not print the token. Webhook secrets are unchanged.

### Worker settings

| Name | Kind | Purpose |
|---|---|---|
| `MAIL_FROM` | var | Permitted From address. The browser cannot choose a different one. |
| `MAIL_FROM_NAME` | var | Optional display name. |
| `MAIL_REPLY_TO` | var | Optional Reply-To. Server config only. |
| `MAIL_OWN_ADDRESSES` | var | Comma-separated identities excluded from reply-all. |
| `EMAIL_ACCOUNT_ID` | var | Account id for the API path. Set from `CLOUDFLARE_ACCOUNT_ID` at deploy. |
| `EMAIL_API_TOKEN` | secret | Email Sending: Edit token. |

If any of `MAIL_FROM`, `EMAIL_ACCOUNT_ID`, or `EMAIL_API_TOKEN` is missing, `POST /api/send` returns **503** and names what is missing. It does not pretend the message was sent.

## Behaviour

- Compose is a form in the inbox: To, a Cc/Bcc disclosure, subject, and a text editor with bold, italic, underline, lists, links, quotes, and undo/redo.
- The worker sanitizes HTML before sending (no scripts, event handlers, `javascript:` URLs, or remote images) and derives the plain-text part from that HTML, keeping paragraphs.
- Reply uses a valid Reply-To, otherwise From. The subject gains one `Re:`. `In-Reply-To` and `References` come from the stored message.
- Reply all adds the original To and Cc, drops your own addresses and duplicates, and never includes an original Bcc. Recipients stay editable. Send is manual.
- Forward starts with empty recipients and one `Fwd:`. The quoted block includes From, Date, Subject, To, and Cc, not Bcc. `References` includes the original Message-ID. `In-Reply-To` is left off, because a forward is not a reply.
- Attachments and inline images are not copied into the outgoing message. The draft says so when the original has attachments. Pasted images are dropped instead of being fetched.
- The send button disables on click and sends an idempotency key. A repeat with the same key, in the same worker isolate, does not call Cloudflare again. A network failure or HTTP 408/429/5xx is not retried, because the message may already have been accepted. A clear 4xx rejection can be corrected and sent again.
- Delete and send both require the existing Access check (when configured) and a same-origin request (`Origin` and `Sec-Fetch-Site`).

## Local mock

`apps/web-inbox/scripts/mock-inbox.mjs` serves the inbox with a few synthetic messages and a fake Email Sending response. It never calls Cloudflare and never reads a real bucket.

```bash
node apps/web-inbox/scripts/mock-inbox.mjs
```

Open the printed URL. A normal send is reported as **queued**, not delivered. A subject of `mock reject` returns the provider's rejection text.

## Turning it off

Set `outbound.enabled` to `false`, redeploy the web worker, and delete the secret if you want it gone:

```bash
npx wrangler secret delete EMAIL_API_TOKEN
```

Inbound mail, routing, and the bucket are not involved.
