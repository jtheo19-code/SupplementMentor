---
name: Client-side free-tier paywall with Stripe Checkout
description: Pattern used for gating a free-tier usage limit without a user auth system, backed by real Stripe Checkout.
---

For apps with no auth/user accounts, a free-tier usage cap (e.g. "N free generations") can be enforced entirely client-side via localStorage counters plus a real server-side Stripe Checkout session for upgrade — no backend user table needed.

**Why:** The product had no auth system and adding one just to gate a feature would have been substantial extra scope the user didn't ask for. Stripe Checkout's session-based verification (`GET /checkout/verify?sessionId=`) is enough to confirm payment without persisting a user identity server-side.

**How to apply:**
- Track usage count and pro status in localStorage (e.g. `sm_generations` int counter, `sm_isPro` boolean flag).
- On checkout success redirect (`?session_id=...`), verify the session server-side via the checkout verify endpoint; if active, set the pro flag in localStorage and strip the query param.
- This is a per-browser limit, not a per-user limit — acceptable for a low-stakes free tier but won't survive a cleared cache or a different device. Flag this tradeoff to the user if they later want cross-device enforcement (would require real auth).
