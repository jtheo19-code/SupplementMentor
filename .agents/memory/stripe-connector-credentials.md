---
name: Stripe Replit connector credential field names
description: The actual field names returned by the Replit Stripe connector's /api/v2/connection endpoint, which differ from the stripe skill's code template.
---

The Stripe skill's `code-templates.md` sample `stripeClient.ts` reads `settings.secret_key` and `settings.webhook_secret` from the connector response, but the live `/api/v2/connection?include_secrets=true&connector_names=stripe` payload actually returns `settings.secret` (not `secret_key`) and has no `webhook_secret` field at all (webhook secret is managed internally by `stripeSync.findOrCreateManagedWebhook`, not fetched manually).

**Why:** Following the skill template literally caused `getStripeCredentials()` to always throw "missing secret key" even though the connector was healthy and connected — the field just had a different name in the actual API response.

**How to apply:** When wiring `stripeClient.ts` (both in the API server and in `scripts/`), read `settings.secret` for the Stripe secret key, and pass only `stripeSecretKey` to `new StripeSync(...)` (omit `stripeWebhookSecret`, which isn't available/needed from this endpoint). If the connector response shape changes again, fetch it directly with a redacted debug script before assuming the skill template is correct.

Also: `runMigrations({ databaseUrl, schema: 'stripe' })` from `stripe-replit-sync` does NOT accept a `schema` option (its `MigrationConfig` type only has `databaseUrl`, `ssl`, `logger` — schema is hardcoded internally to `"stripe"`). Passing `schema` is a TS error under strict mode; just call `runMigrations({ databaseUrl })`.
