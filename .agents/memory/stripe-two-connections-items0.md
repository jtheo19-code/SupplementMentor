---
name: Two Stripe connections — deterministic account pinning
description: Why the server must pin the Stripe account by price ownership + mode guard instead of connector ordering.
---

# Two connected Stripe accounts + deterministic selection

The project has **two healthy Stripe connections that are different accounts** — a TEST account and a separate LIVE account — not just test/live modes of one account.

- `STRIPE_PRO_PRICE_ID` is a **test-mode** price that exists only in the TEST account; it 404s against the LIVE account.
- The connector returns items in creation order. The server used to resolve credentials via `data.items?.[0]`, which happened to be the TEST account only because it was created first — nondeterministic and unsafe.

**Resolution (current design):** account selection is pinned deterministically, never by connector ordering:
1. One connection -> use it.
2. Multiple -> select the account that OWNS `STRIPE_PRO_PRICE_ID` (probe `prices.retrieve`; `resource_missing`/404 = not that account). Self-correcting: a test price resolves to the test account, a live price to the live account. Fails closed (throws) if none own it, or if multiple are connected and the price id is unset. Price-probe only treats `resource_missing`/404 as "not this account"; other errors (auth/rate-limit/transient) are surfaced, not masked.
3. `STRIPE_ACCOUNT_MODE` (`test`|`live`) is a hard guard: if set, the resolved key's mode (from `sk_/rk_` + `test_/live_` prefix) must match or it throws. **In production it is REQUIRED** — the server refuses to start against an undeclared account, so a stale test price id can't silently run prod on the test account.

**Why:** ordering is not guaranteed; a reconnect/service change could silently switch accounts -> broken checkout or, worse, real charges. Pinning by price ownership + a prod-required mode guard removes the guess.

**How to apply / go-live:** `STRIPE_ACCOUNT_MODE` is set to `test` in the **shared** env, so dev and the current deploy run TEST (no real charges). To go live: set `STRIPE_ACCOUNT_MODE=live` and swap `STRIPE_PRO_PRICE_ID` to the live-account price id (both in shared env). Selection resolves per-process with a 10-min cache, so a rotated key takes up to 10 min to pick up. Logic lives in `stripeClient.ts` (`getStripeCredentials` / `selectSecretOwningPrice` / `assertModeGuard`).
