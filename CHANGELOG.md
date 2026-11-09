# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Optional outbound mail on the web inbox: compose, reply, reply all, and forward through Cloudflare Email Sending (`POST /accounts/{account_id}/email/sending/send`).
- The From address and the API token come from worker configuration (`MAIL_FROM`, `EMAIL_API_TOKEN`, and related vars). Sending stays off, and says so, until they are set.
- Cc and Bcc use the provider's recipient fields. Bcc is not copied into headers or reply drafts. See [docs/outbound.md](docs/outbound.md).

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
