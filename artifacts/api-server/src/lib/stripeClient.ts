import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";
import { logger } from "./logger";

type StripeMode = "test" | "live";

/**
 * Determine whether a Stripe secret/restricted key is a test or live key.
 * Stripe keys are prefixed sk_/rk_ + test_/live_.
 */
function keyMode(secret: string): StripeMode | "unknown" {
  if (/^(sk|rk)_live_/.test(secret)) return "live";
  if (/^(sk|rk)_test_/.test(secret)) return "test";
  return "unknown";
}

/**
 * The account is pinned deterministically, never by connector ordering.
 *
 * With multiple Stripe connections (e.g. a test account and a separate live
 * account both connected) the correct one is the account that actually owns the
 * configured STRIPE_PRO_PRICE_ID. Selecting by price ownership is self-correcting:
 * a test price resolves to the test account, a live price to the live account,
 * and it fails closed (throws) if no connected account owns the price rather than
 * silently charging against the wrong account.
 *
 * Optionally, STRIPE_ACCOUNT_MODE ("test" | "live") acts as a hard guard: if set,
 * the resolved key's mode must match, so production can refuse to run against the
 * test account even if a stale test price id is left in the environment.
 */
const SELECTION_TTL_MS = 10 * 60 * 1000;
let cachedSelection: { secretKey: string; expiresAt: number } | null = null;

async function fetchStripeSecrets(): Promise<string[]> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Missing Replit environment variables. " +
        "Ensure the Stripe integration is connected via the Integrations tab.",
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resp.ok) {
    throw new Error(
      `Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`,
    );
  }

  const data = (await resp.json()) as {
    items?: Array<{ settings?: { secret?: string } }>;
  };

  return (data.items ?? [])
    .map((item) => item.settings?.secret)
    .filter((secret): secret is string => !!secret);
}

/**
 * From the connected accounts, pick the one whose account owns `priceId`.
 * A price retrieve with the wrong account's key returns resource_missing, so a
 * successful retrieve uniquely identifies the owning account.
 */
async function selectSecretOwningPrice(
  secrets: string[],
  priceId: string,
): Promise<string> {
  let unexpectedError: unknown = null;
  for (const secret of secrets) {
    try {
      const probe = new Stripe(secret);
      await probe.prices.retrieve(priceId);
      return secret;
    } catch (err) {
      const e = err as { code?: string; statusCode?: number };
      // Price simply not in this account -> try the next candidate.
      if (e?.code === "resource_missing" || e?.statusCode === 404) {
        continue;
      }
      // Transient / auth / rate-limit error: remember it, keep probing the
      // other accounts, but surface it if nothing ends up matching so we don't
      // mask an outage as a benign "no account owns price".
      unexpectedError = err;
    }
  }
  if (unexpectedError) {
    throw new Error(
      `Failed to resolve which Stripe account owns STRIPE_PRO_PRICE_ID (${priceId}): ` +
        `${(unexpectedError as Error)?.message ?? String(unexpectedError)}`,
    );
  }
  throw new Error(
    `No connected Stripe account owns STRIPE_PRO_PRICE_ID (${priceId}). ` +
      "Verify the price id matches the intended (test vs live) Stripe account.",
  );
}

function assertModeGuard(secretKey: string): void {
  const required = process.env.STRIPE_ACCOUNT_MODE?.toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";

  if (required !== "test" && required !== "live") {
    // In production the mode must be declared explicitly — never guess, so a
    // stale test price id can't silently run production against the test account.
    if (isProduction) {
      throw new Error(
        'STRIPE_ACCOUNT_MODE must be set to "test" or "live" in production to pin ' +
          "the Stripe account. Refusing to start against an undeclared account.",
      );
    }
    return;
  }

  const mode = keyMode(secretKey);
  if (mode !== required) {
    throw new Error(
      `STRIPE_ACCOUNT_MODE is "${required}" but the resolved Stripe account is "${mode}". ` +
        "Refusing to proceed against the wrong account.",
    );
  }
}

async function getStripeCredentials(): Promise<{ secretKey: string }> {
  if (cachedSelection && cachedSelection.expiresAt > Date.now()) {
    return { secretKey: cachedSelection.secretKey };
  }

  const secrets = await fetchStripeSecrets();

  if (secrets.length === 0) {
    throw new Error(
      "Stripe integration not connected or missing secret key. " +
        "Connect Stripe via the Integrations tab first.",
    );
  }

  let selected: string;
  if (secrets.length === 1) {
    selected = secrets[0];
  } else {
    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) {
      throw new Error(
        `Multiple Stripe accounts are connected (${secrets.length}) but STRIPE_PRO_PRICE_ID ` +
          "is not set, so the correct account cannot be determined. Set STRIPE_PRO_PRICE_ID " +
          "(or disconnect the unused account) to pin the account deterministically.",
      );
    }
    selected = await selectSecretOwningPrice(secrets, priceId);
  }

  assertModeGuard(selected);

  cachedSelection = {
    secretKey: selected,
    expiresAt: Date.now() + SELECTION_TTL_MS,
  };

  logger.info(
    {
      stripeMode: keyMode(selected),
      connectedAccounts: secrets.length,
      selectedBy: secrets.length === 1 ? "only-connection" : "price-owner",
      modeGuard: process.env.STRIPE_ACCOUNT_MODE?.toLowerCase() ?? "none",
    },
    "Resolved Stripe account",
  );

  return { secretKey: selected };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const { secretKey } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
  });
}
