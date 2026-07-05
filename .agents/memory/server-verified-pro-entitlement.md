---
name: Server-verified Pro entitlement (no-auth)
description: How Pro access is enforced server-side in an app with no user auth, and the accepted tradeoffs.
---

Pro access is NOT a client-settable flag. The client stores only the Stripe **checkout session id** (localStorage `sm_session_id`), set solely after server verification, and sends it as header `x-sm-session-id` on gated requests. The server (`stripeService.verifyProAccess`) retrieves the checkout session (expand subscription) and grants Pro only when the checkout is complete+paid AND the subscription status is `active`/`trialing`. Results cached in-memory (short TTL), no DB table.

**Why:** The app has no auth system. Enforcing Pro purely client-side (the old `sm_isPro` boolean + "Continue without upgrading" button) meant anyone could grant themselves Pro. Verifying the session against Stripe on every gated call makes entitlement authoritative without adding auth or a usage table.

**How to apply:**
- Gate expensive/pro endpoints with `attachEntitlement` (sets `req.isPro`) then a rate limiter whose `skip` checks `req.isPro`. See `middleware/entitlement.ts` + `middleware/rateLimit.ts`.
- The 2-free-generation trial stays a client-side soft limit (localStorage `sm_generations`); the server-side rate limiter is the abuse backstop, not a strict per-user free counter.
- `app.set("trust proxy", 1)` is required so express-rate-limit keys on the real client IP behind Replit's proxy.

**Accepted Phase-1 tradeoffs (bounded, documented on purpose):**
- `x-sm-session-id` is effectively a bearer credential — a leaked/shared valid session id grants Pro to another caller until the subscription lapses. Inherent to no-auth; revisit if real accounts are added.
- In-memory rate-limit store + verify cache are per-instance and reset on restart; on autoscale (multi-instance) limits aren't global and can be softened by instance-hopping. Move to shared Redis if stronger enforcement is needed.
- No strict "2 lifetime free" for anonymous users without an auth/usage table (explicitly deferred).
- Rate limits are env-tunable: `TIMING_MAP_RATE_LIMIT` (default 20/hr), `SCAN_LABEL_RATE_LIMIT` (default 10/hr).
