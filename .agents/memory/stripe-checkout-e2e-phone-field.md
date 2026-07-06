---
name: Stripe hosted-checkout E2E requires phone field
description: Automated E2E of the Pro upgrade must fill Stripe Checkout's required phone number or Subscribe silently fails.
---

Stripe's hosted Checkout page for this app has a REQUIRED phone number field. In an automated Playwright E2E, if the phone field is left empty the Subscribe button does nothing — it stays on checkout.stripe.com with no visible inline error and never redirects back. The card iframe (4242 4242 4242 4242), expiry, CVC, name, country, and ZIP are not enough on their own.

**Why:** discovered after a first E2E run stalled on Subscribe with no error; the screenshot showed a red validation icon on the phone field. Adding a valid US phone (e.g. "(201) 555-0123") made the same flow pass end-to-end.

**How to apply:** any future automated test of the free→paywall→Stripe→Pro flow must explicitly fill the phone number on the Stripe page. On success the app returns to `/app/map?checkout=success&session_id=cs_test_...`, verifies server-side, and stores `sm_session_id`. Backend pieces (checkout session creation, `verifyProAccess` rejecting forged ids) are curl-testable; only the paid→Pro grant needs the browser to complete Stripe's hosted form.
