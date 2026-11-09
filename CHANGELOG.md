# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Optional outbound mail on the web inbox: compose, reply, reply all, and forward through Cloudflare Email Sending (`POST /accounts/{account_id}/email/sending/send`).
- The From address and the API token come from worker configuration (`MAIL_FROM`, `EMAIL_API_TOKEN`, and related vars). Sending stays off, and says so, until they are set.
- Cc and Bcc use the provider's recipient fields. Bcc is not copied into headers or reply drafts. See [docs/outbound.md](docs/outbound.md).
- A submission id is claimed with an atomic R2 create (`etagDoesNotMatch: "*"`) on `outbound/sends/` before Cloudflare is called. Ambiguous and in-progress claims are not retried. The claim survives a new worker isolate.
- Compose and forward can attach files, within the documented 25 MiB Email Sending limit. Replies do not include the original files unless you add them. The claim hash covers attachment bytes.
- Sent reads Email Sending activity (`emailSendingAdaptive`) for 31 days. It is metadata only: no message body and no attachment files.
- A Sent item can open that message in the Cloudflare dashboard when `outbound.activityLogBase` is set. The link stays off until that prefix is configured.
- Outgoing HTML is serialized from parser tags with plain names. Split tags such as `<ifr<iframe>` are not reassembled, and the dashboard prefix is trimmed without a slash-quantifying expression.

## [0.1.0] - 2026-10-27

### Added
- `apps/email-worker`: archives raw mail to private R2, recipient filter (`ACCEPT_RECIPIENTS`), R2-backed drop list
  with optional SMTP `550 5.7.1` reject, Cloudflare-only authentication verdict and self-spoof flag, webhook with
  retry/backoff and `failed/` records.
- `apps/web-inbox`: R2-backed inbox with sanitized HTML reader, headers view, Message ID copy, Dropped/Failed/
  Unsubscribed pills, delete, swipe-back; optional in-Worker Cloudflare Access JWT verification.
- `r2-inbox.config.json` single configuration file with validation.
- Scripts: `setup`, `deploy`, `routing`, `teardown`, `doctor`, `droplist-sync`, `fetch-message`, all with `--dry-run`.
- CI (lint + tests) and an optional manual deploy workflow.
