import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient } from "./stripeClient";

export class StripeService {
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

  async getCheckoutSessionStatus(sessionId: string) {
    const stripe = await getUncachableStripeClient();

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      return false;
    }

    const isActive =
      session.status === "complete" && session.payment_status === "paid";

    if (isActive && session.customer && typeof session.customer === "string") {
      await db
        .update(usersTable)
        .set({
          stripeSubscriptionId:
            typeof session.subscription === "string"
              ? session.subscription
              : (session.subscription?.id ?? null),
        })
        .where(eq(usersTable.stripeCustomerId, session.customer));
    }

    return isActive;
  }
}

export const stripeService = new StripeService();
