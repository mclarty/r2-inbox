# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
