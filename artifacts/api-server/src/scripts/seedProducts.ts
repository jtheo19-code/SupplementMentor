import { db, productsTable } from "@workspace/db";
import { generateAllProducts } from "../lib/productGenerator";
import { logger } from "../lib/logger";

async function main() {
  const products = generateAllProducts(1000);
  logger.info({ count: products.length }, "Seeding products");

  const BATCH_SIZE = 200;
  await db.delete(productsTable);

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE).map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      badge: p.badge,
      ingredients: p.ingredients,
      popular: p.popular ? "yes" : "no",
    }));
    await db.insert(productsTable).values(batch);
    logger.info({ inserted: Math.min(i + BATCH_SIZE, products.length) }, "Seed progress");
  }

  logger.info("Done seeding products");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Failed to seed products");
  process.exit(1);
});
