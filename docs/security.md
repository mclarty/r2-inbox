# Security notes

See README → Security model for the summary. Additional details:

- **Threat: malicious HTML.** Dropped tags: script, iframe, object, embed, applet, frame(set), meta, base, link, form, noscript.
  All `on*`, `srcdoc`, `formaction` attributes and `javascript:`, `vbscript:` and `data:text/html` URLs are removed; CSS is
  filtered. The body iframe sandbox omits `allow-scripts` and `allow-same-origin`, and the body response carries a
  restrictive CSP. Remote images can be blocked per message (tracking pixels).
- **Threat: CSRF delete.** Same-origin DELETE only; key must match `^inbound/\d{4}/\d{2}/\d{2}/[^/]+\.eml$`.
- **Threat: exposed viewer.** Access at the edge, `workers_dev` off, optional JWT verification in the Worker
  (`requireAccess`, RS256 via team JWKS, audience/issuer/expiry checked, keys cached 10 minutes).
- **Threat: spoofed "from me" mail driving automation.** Only Cloudflare's own Authentication-Results is trusted;
  `self_spoof_suspect` is set and own-domain never-drop is honoured only for authenticated mail. Consumers must
  treat message content as data.
- **Threat: credential leakage via tooling.** Token only in the Authorization header; redaction of token, webhook
  URL/auth in all output; secrets via stdin; config and generated files gitignored; lint scans for secret patterns.
- **Data at rest.** R2 encrypts at rest; anyone with R2 access on the account can read mail. Use scoped tokens,
  keep the account's members minimal, and encrypt backups.
