# Drop lists

`config/droplist.json` in the bucket controls which mail is dropped (archived + `dropped/` record, no webhook)
and, with `REJECT_DROPPED=true`, refused at SMTP time. Upload with `scripts/droplist-sync FILE` (validated first).
Workers reload it within 5 minutes. A missing or invalid list means **nothing is dropped** (fail open).

```json
{
  "reject_dropped": true,
  "never_drop": ["bank.example"],
  "allow":  { "senders": ["receipts@shop.example"], "domains": ["orders.shop.example"] },
  "drop": {
    "senders":  [{ "address": "promo@newsletter.example" }],
    "domains":  [{ "domain": "marketing.example", "subdomains": true }, { "domain": "deals.shop.example" }],
    "subjects": [{ "pattern": "^\\[ad\\]", "flags": "i" }]
  }
}
```

Evaluation order for a message (From header address, falling back to the envelope sender):

1. Own domains (`SELF_DOMAINS`): never dropped **only if** authenticated (`auth_verdict=pass`); otherwise evaluated normally.
2. `never_drop` / `NEVER_DROP` domains (and subdomains): never dropped.
3. `allow.senders` exact address: skips sender/domain rules (subject rules still apply).
4. `drop.senders` exact address (case-insensitive).
5. Domains: the **most specific** ruling wins between `drop.domains` and `allow.domains`, so you can drop
   `deals.shop.example` while keeping `shop.example`, or drop `marketing.example` but allow `orders.marketing.example`.
   `subdomains` defaults to true; set false for exact-domain only.
6. `drop.subjects`: JavaScript regex, always case-insensitive; a leading `(?i)` is accepted. Invalid patterns are skipped.

`"reject_dropped": false` is a kill switch for SMTP rejects without redeploying.

## Unsubscribe pills (optional)

`config/unsubscribed.json` (see `examples/unsubscribed.example.json`) marks messages you unsubscribed from and
later mail from the same sender. Write it with your own tooling; the inbox only reads it.
