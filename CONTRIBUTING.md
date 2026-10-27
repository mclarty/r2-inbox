# Contributing

Thanks for helping! This project aims to stay small, dependency-light and easy to audit.

## Setup

```bash
npm install
npm run check      # lint + all tests; must pass before a PR
```

Node 22+ is needed for Wrangler; tests run on Node 20+.

## Guidelines

- **No real data.** Never commit real email, addresses, Message-IDs, account/zone IDs, tokens or drop lists.
  Use `example.com`, `example.net`, `example.test` and synthetic messages only. `npm run lint` scans for obvious secrets.
- **Tests first.** Every behaviour change in a worker needs a `node:test` case. Scripts must keep working in
  `--dry-run` and must never print credentials (there is a test for that, extend it when adding commands).
- **Fail safe for mail.** The email worker must never drop a message it could not archive; prefer throwing
  (sender gets a bounce) over silent loss. The drop list fails open.
- **Security-sensitive areas** (`sanitize.js`, `access.js`, delete handling, auth verdict) need a clear
  explanation in the PR and tests for the attack you are guarding against.
- Keep scripts idempotent: read state, compare, then write.
- Update `README.md`, `docs/` and `CHANGELOG.md` (Unreleased) with user-visible changes.

## Commit / PR

Small focused commits, imperative subject lines. Fill in the PR template. CI must be green.
