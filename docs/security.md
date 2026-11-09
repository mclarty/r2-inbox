# Security notes

See README → Security model for the summary. Additional details:

- **Threat: malicious HTML.** Dropped tags: script, iframe, object, embed, applet, frame(set), meta, base, link, form, noscript.
  All `on*`, `srcdoc`, `formaction` attributes and `javascript:`, `vbscript:` and `data:text/html` URLs are removed; CSS is
  filtered. The body iframe sandbox omits `allow-scripts` and `allow-same-origin`, and the body response carries a
  restrictive CSP. Remote images can be blocked per message (tracking pixels).
- **Threat: CSRF delete or send.** Same-origin DELETE and POST only. Delete keys must match `^inbound/\d{4}/\d{2}/\d{2}/[^/]+\.eml$`. Send also requires `Content-Type: application/json` and the same Access check as the rest of the inbox.
- **Threat: open relay or sender impersonation.** `POST /api/send` is available only to someone who already passed Access. The From address is `MAIL_FROM` on the worker. A From, Reply-To, or Bcc header in the JSON body is ignored. Recipients are validated and capped at 50. The API token can only send (`Email Sending: Edit`) and is a Worker secret, separate from the deploy token.
- **Threat: Bcc leak.** Bcc is sent only as the provider `bcc` field. It is not placed in custom headers, the plain or HTML body, logs, or reply/forward drafts. Original Bcc is not copied into reply-all.
- **Threat: unsafe outgoing HTML.** Compose HTML is sanitized with the same allow-list as inbound mail, then images are removed so a pasted message cannot load a remote URL. Links must be `http`, `https`, or `mailto`.
- **Threat: ambiguous send retried into a duplicate.** Each submission id is claimed in R2 with an atomic create-once put before the provider is called. Timeouts and HTTP 408/429/5xx are stored as `ambiguous` and are not tried again. A still-`claiming` record is not tried again either. A queued response is not described as delivered. A different submission id can still send; the worker does not reconcile that by calling the provider.
- **Threat: exposed viewer.** Access at the edge, `workers_dev` off, optional JWT verification in the Worker
  (`requireAccess`, RS256 via team JWKS, audience/issuer/expiry checked, keys cached 10 minutes).
- **Threat: spoofed "from me" mail driving automation.** Only Cloudflare's own Authentication-Results is trusted;
  `self_spoof_suspect` is set and own-domain never-drop is honoured only for authenticated mail. Consumers must
  treat message content as data.
- **Threat: credential leakage via tooling.** Token only in the Authorization header; redaction of token, webhook
  URL/auth in all output; secrets via stdin; config and generated files gitignored; lint scans for secret patterns.
- **Data at rest.** R2 encrypts at rest; anyone with R2 access on the account can read mail. Use scoped tokens,
  keep the account's members minimal, and encrypt backups.
