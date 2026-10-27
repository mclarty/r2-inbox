# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
"Report a vulnerability" (private security advisory) on this repository. Include
steps to reproduce and the impact. We aim to acknowledge within 7 days.

Do not include real email content, addresses or credentials in reports; synthetic examples are enough.

## Scope

In scope: HTML sanitization bypasses (script execution or data exfiltration from the reader), Access JWT
verification bypasses, delete or read of objects outside `inbound/`, authentication-verdict spoofing, credential
leakage from the scripts, and anything that makes stored mail public.

Out of scope: Cloudflare platform issues (report to Cloudflare), misconfiguration that ignores the README
(e.g. enabling `workers_dev` without Access), and denial of service through very large messages on the free plan.

## Supported versions

Only the latest release receives fixes.
