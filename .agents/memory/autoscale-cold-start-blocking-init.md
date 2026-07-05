---
name: Don't block app.listen on slow init in autoscale deploys
description: Why "app not running" flashes on cold start and how startup ordering fixes it
---

# Autoscale cold-start: listen before slow init

On an **autoscale** deployment, blocking `app.listen()` on slow startup work makes the deployment show **"app not running"** on every cold start.

**Why:** the platform runs a startup health probe (configured in `.replit-artifact/artifact.toml` under `[services.production.health.startup] path = "/api/healthz"`). If the server does slow work (DB migrations, live third-party API calls — here `await initStripe()` which runs `runMigrations` + Stripe managed-webhook setup) *before* `app.listen()`, nothing is listening during that window, so the probe fails (surfaced as a 500 cluster in deployment logs right after "artifact process started") until init finishes. Autoscale scales to zero between traffic, so this recurs on each cold boot, not just first deploy.

**How to apply:** call `app.listen()` first so `/api/healthz` passes immediately, then run the slow init fire-and-forget in the listen callback (`void initStripe().catch(...)`). Keep `/api/healthz` shallow (process-up only), never gate it on dependency readiness.

**Caveats:**
- This creates a brief readiness gap for dependency-backed routes (Stripe webhook/billing) on a cold instance; Stripe retries non-2xx so events are delayed, not lost. Acceptable tradeoff for platform health here.
- Fire-and-forget init must be `.catch()`-guarded: a check that throws *outside* the init function's own try/catch (e.g. the `DATABASE_URL` guard) would otherwise become an unhandled rejection.
- Fix lives in dev only until republished — production picks it up on the next deploy.
