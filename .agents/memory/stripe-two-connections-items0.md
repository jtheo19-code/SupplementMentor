---
name: Two Stripe connections make items[0] selection nondeterministic
description: Latent risk when multiple Stripe connectors are connected and the server blindly picks items[0].
---

# Two connected Stripe accounts + items[0] selection

The project has (had) **two healthy Stripe connections that are different accounts** — a TEST account and a separate LIVE account — not just test/live modes of one account. The server resolves credentials via `data.items?.[0]` from the connector endpoint.

- `STRIPE_PRO_PRICE_ID` is a **test-mode** price that exists only in the TEST account. It 404s against the LIVE account.
- The connector returns items in creation order, so `items[0]` currently = the TEST account (created first). This is why dev/checkout works in test mode.

**Why this is a risk:** the ordering is not guaranteed. If the connector ever reorders (reconnect, service change), the server could silently switch to the LIVE account -> either checkout breaks ("No such price") or, if a live price existed, real cards get charged. Nothing in code pins the intended account/mode.

**How to apply:** before a real go-live, make the account selection deterministic (e.g. pick the connection whose account actually contains the configured price id, or gate by an explicit mode env var) instead of trusting `items[0]`. Until then, the deployed app runs in whatever mode `items[0]` happens to be — currently TEST (no real charges).
