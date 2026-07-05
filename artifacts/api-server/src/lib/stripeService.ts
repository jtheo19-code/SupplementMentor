import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient } from "./stripeClient";

const PRO_STATUSES = new Set(["active", "trialing"]);

const POSITIVE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_TTL_MS = 30 * 1000;

type CacheEntry = { isPro: boolean; expiresAt: number };

export class StripeService {
  private proCache = new Map<string, CacheEntry>();

  async findOrCreateCustomer(email: string) {
    const stripe = await getUncachableStripeClient();
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (existing?.stripeCustomerId) {
      return existing.stripeCustomerId;
    }

    const customer = await stripe.customers.create({ email });

    if (existing) {
      await db
        .update(usersTable)
        .set({ stripeCustomerId: customer.id })
        .where(eq(usersTable.id, existing.id));
    } else {
      await db
        .insert(usersTable)
        .values({ email, stripeCustomerId: customer.id });
    }

    return customer.id;
  }

  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
  ) {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  /**
   * Server-side source of truth for Pro access.
   *
   * Given a Stripe Checkout session id (the only credential the anonymous
   * client holds after paying), confirm with Stripe that the checkout was paid
   * AND that the resulting subscription is currently active/trialing. A paid
   * one-off checkout whose subscription later lapses will correctly return
   * false. Results are cached in-memory for a short TTL to avoid hitting the
   * Stripe API on every gated request (no DB table needed).
   */
  async verifyProAccess(sessionId: string): Promise<boolean> {
    if (!sessionId) return false;

    const cached = this.proCache.get(sessionId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.isPro;
    }

    const isPro = await this.checkStripe(sessionId);
    this.proCache.set(sessionId, {
      isPro,
      expiresAt: Date.now() + (isPro ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS),
    });
    return isPro;
  }

  private async checkStripe(sessionId: string): Promise<boolean> {
    const stripe = await getUncachableStripeClient();

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      });
    } catch {
      return false;
    }

    const paid =
      session.status === "complete" && session.payment_status === "paid";
    if (!paid) return false;

    const subscription = session.subscription;
    let subscriptionId: string | null = null;
    let subscriptionActive = false;

    if (subscription && typeof subscription === "object") {
      subscriptionId = subscription.id;
      subscriptionActive = PRO_STATUSES.has(subscription.status);
    } else if (typeof subscription === "string") {
      subscriptionId = subscription;
      try {
        const sub = await stripe.subscriptions.retrieve(subscription);
        subscriptionActive = PRO_STATUSES.has(sub.status);
      } catch {
        subscriptionActive = false;
      }
    }

    if (
      subscriptionId &&
      session.customer &&
      typeof session.customer === "string"
    ) {
      await db
        .update(usersTable)
        .set({ stripeSubscriptionId: subscriptionId })
        .where(eq(usersTable.stripeCustomerId, session.customer));
    }

    return subscriptionActive;
  }
}

export const stripeService = new StripeService();
