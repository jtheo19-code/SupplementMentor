---
name: Stripe checkout return must not depend on in-memory wizard state
description: Why returning from Stripe Checkout silently failed to grant Pro, and the persistence rule that fixes it.
---

# Stripe checkout return vs. in-memory wizard state

Returning from Stripe Checkout is a **full page load** (external redirect back to the app). Any client state held only in React memory (e.g. the wizard's selected `productIds`/anchors) is reset to empty on that load.

**The bug:** the map page's mount effect redirected to `/app` whenever `productIds` was empty. On checkout return the stack was empty, so it bounced away *before* the `?session_id` could be verified and `sm_session_id` stored — so payment succeeded (Stripe webhooks fired) but Pro was never granted. Not reproducible without an end-to-end browser test through real Stripe Checkout; curl/unit tests miss it.

**Why:** the success flow's `success_url` points back to the map page, but the code path that grants Pro (verify session -> store `sm_session_id`) can be pre-empted by unrelated state guards that run first.

**How to apply:**
- Persist wizard state so it survives the checkout round-trip (sessionStorage; same-tab persists across the cross-origin redirect).
- Any redirect/guard on the checkout-return page must be suppressed while a checkout `session_id` is present, until verification completes; the verify effect owns post-verification navigation.
- When touching the paywall/checkout flow, re-run the full browser E2E through actual Stripe test checkout (card 4242…) — server-side curl cannot catch this class of bug.
