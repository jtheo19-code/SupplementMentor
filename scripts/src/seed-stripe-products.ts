import { getUncachableStripeClient } from "./stripeClient";

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  console.log("Creating SupplementMentor Pro plan in Stripe...");

  const existing = await stripe.products.search({
    query: "name:'SupplementMentor Pro' AND active:'true'",
  });

  let productId: string;
  if (existing.data.length > 0) {
    console.log("SupplementMentor Pro already exists. Reusing it.");
    productId = existing.data[0]!.id;
  } else {
    const product = await stripe.products.create({
      name: "SupplementMentor Pro",
      description:
        "Unlimited timing maps, full stack audits, and priority updates to your supplement schedule.",
    });
    console.log(`Created product: ${product.name} (${product.id})`);
    productId = product.id;
  }

  const existingPrices = await stripe.prices.list({
    product: productId,
    active: true,
  });

  const monthlyPrice = existingPrices.data.find(
    (p) => p.unit_amount === 1099 && p.recurring?.interval === "month",
  );

  if (monthlyPrice) {
    console.log(`Monthly price already exists: ${monthlyPrice.id}`);
    console.log(`STRIPE_PRO_PRICE_ID=${monthlyPrice.id}`);
    return;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: 1099,
    currency: "usd",
    recurring: { interval: "month" },
  });

  console.log(`Created monthly price: $10.99/month (${price.id})`);
  console.log(`STRIPE_PRO_PRICE_ID=${price.id}`);
}

createProducts().catch((err) => {
  console.error("Error creating products:", err);
  process.exit(1);
});
