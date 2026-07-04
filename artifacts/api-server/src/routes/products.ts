import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { sql, or, ilike, eq } from "drizzle-orm";
import {
  ListProductsQueryParams,
  ListProductsResponse,
  ListPopularProductsResponse,
  ScanProductLabelBody,
  ScanProductLabelResponse,
} from "@workspace/api-zod";
import { db, productsTable, type ProductRow } from "@workspace/db";
import { scanLabelImage } from "../lib/labelScan";

const router: IRouter = Router();

function toApiProduct(p: ProductRow) {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    badge: p.badge,
    ingredients: p.ingredients.map((i) => ({ name: i.name, mgAmount: i.mgAmount })),
  };
}

router.get("/products", async (req, res) => {
  const { search } = ListProductsQueryParams.parse(req.query);
  const term = search?.trim();

  const rows = term
    ? await db
        .select()
        .from(productsTable)
        .where(
          or(
            ilike(productsTable.name, `%${term}%`),
            sql`EXISTS (
              SELECT 1 FROM jsonb_array_elements(${productsTable.ingredients}) elem
              WHERE elem->>'name' ILIKE ${`%${term}%`}
            )`,
          ),
        )
        .limit(100)
    : await db.select().from(productsTable).where(eq(productsTable.popular, "yes")).limit(100);

  const data = ListProductsResponse.parse(rows.map(toApiProduct));
  res.json(data);
});

router.post("/products/scan-label", async (req, res) => {
  const body = ScanProductLabelBody.parse(req.body);

  let scanned;
  try {
    scanned = await scanLabelImage(body.imageBase64, body.mimeType, body.productNameHint);
  } catch (err) {
    req.log.error({ err }, "Label scan request to vision model failed");
    res.status(400).json({ error: "Could not read that label. Try a clearer, well-lit photo." });
    return;
  }

  if (scanned.ingredients.length === 0) {
    res.status(400).json({ error: "No ingredients could be read from that photo. Try a clearer, well-lit photo of the Supplement Facts panel." });
    return;
  }

  const [row] = await db
    .insert(productsTable)
    .values({
      id: `scanned-${randomUUID()}`,
      name: scanned.productName,
      type: scanned.ingredients.length > 1 ? "blend" : "standalone",
      badge: "scanned from label",
      ingredients: scanned.ingredients,
      popular: "no",
    })
    .returning();

  const data = ScanProductLabelResponse.parse(toApiProduct(row!));
  res.status(200).json(data);
});

router.get("/products/popular", async (_req, res) => {
  const rows = await db.select().from(productsTable).where(eq(productsTable.popular, "yes")).limit(50);

  const data = ListPopularProductsResponse.parse(rows.map(toApiProduct));
  res.json(data);
});

export default router;
