import { runMigrations } from "stripe-replit-sync";
import app from "./app";
import { logger } from "./lib/logger";
import { getStripeSync } from "./lib/stripeClient";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required.");
  }

  try {
    await runMigrations({ databaseUrl });

    const stripeSync = await getStripeSync();

    const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (domain) {
      const webhookBaseUrl = `https://${domain}`;
      await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`,
      );
    }

    stripeSync.syncBackfill().catch((err) => {
      logger.error({ err }, "Error syncing Stripe data");
    });
  } catch (err) {
    logger.error({ err }, "Failed to initialize Stripe");
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Initialize Stripe AFTER the server is already listening, in the
  // background. initStripe runs DB migrations plus live Stripe API calls
  // (managed-webhook setup) that can take several seconds. Blocking startup on
  // them delays app.listen(), so on an autoscale cold start the /api/healthz
  // probe fails until they complete and the deployment briefly shows
  // "app not running". Listening first makes health checks pass immediately.
  // Guard with .catch so a misconfig (e.g. missing DATABASE_URL, which is
  // validated outside initStripe's internal try/catch) can't become an
  // unhandled promise rejection now that this runs fire-and-forget.
  void initStripe().catch((err) => {
    logger.error({ err }, "Background Stripe initialization failed");
  });
});
