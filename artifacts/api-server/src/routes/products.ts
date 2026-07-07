import { Router, type IRouter } from "express";
import { sql, or, ilike, eq } from "drizzle-orm";
import {
  ListProductsQueryParams,
  ListProductsResponse,
  ListPopularProductsResponse,
  ScanProductLabelBody,
  ScanProductLabelResponse,
  ScanShelfBody,
  ScanShelfResponse,
  ConfirmShelfBody,
  ConfirmShelfResponse,
  ContributeVerifiedProductBody,
  ContributeVerifiedProductResponse,
} from "@workspace/api-zod";
import { db, productsTable, type ProductRow } from "@workspace/db";
import { scanLabelImage } from "../lib/labelScan";
import { scanShelfImage } from "../lib/shelfScan";
import {
  formatScannedProductName,
  ingredientsForConfirmedShelfItem,
  insertScannedProduct,
} from "../lib/scannedProductInsert";
import { submitVerifiedProductContribution } from "../lib/verifiedProductContributions";
import { attachEntitlement } from "../middleware/entitlement";
import { scanLimiter } from "../middleware/rateLimit";

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

router.post("/products/scan-label", attachEntitlement, scanLimiter, async (req, res) => {
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

  const row = await insertScannedProduct(
    scanned.productName,
    scanned.ingredients,
    "scanned from label",
    "scanned",
  );

  if (body.verifiedProductId) {
    submitVerifiedProductContribution({
      verifiedProductId: body.verifiedProductId,
      brand: null,
      productName: scanned.productName,
      ingredients: scanned.ingredients,
    });
  }

  const data = ScanProductLabelResponse.parse(toApiProduct(row));
  res.status(200).json(data);
});

router.post("/products/scan-shelf", attachEntitlement, scanLimiter, async (req, res) => {
  const body = ScanShelfBody.parse(req.body);

  let detected;
  try {
    detected = await scanShelfImage(body.imageBase64, body.mimeType, req.log);
  } catch (err) {
    req.log.error({ err }, "Shelf scan request to vision model failed");
    res.status(400).json({ error: "Could not read that shelf photo. Try a clearer, well-lit photo." });
    return;
  }

  if (detected.length === 0) {
    res.status(400).json({
      error: "No supplement bottles could be identified. Try a clearer photo with labels facing the camera.",
    });
    return;
  }

  const data = ScanShelfResponse.parse({ products: detected });
  res.status(200).json(data);
});

router.post("/products/confirm-shelf", async (req, res) => {
  const body = ConfirmShelfBody.parse(req.body);

  const rows: ProductRow[] = [];
  for (const item of body.products) {
    const displayName = formatScannedProductName(item.productName, item.brand ?? null);
    const ingredients = ingredientsForConfirmedShelfItem(
      item.productName,
      item.brand ?? null,
      item.ingredients,
    );
    const row = await insertScannedProduct(
      displayName,
      ingredients,
      "scanned from shelf",
      "scanned-shelf",
    );
    rows.push(row);
  }

  const data = ConfirmShelfResponse.parse({ products: rows.map(toApiProduct) });
  res.status(200).json(data);
});

router.post("/products/contribute-verified-product", async (req, res) => {
  const body = ContributeVerifiedProductBody.parse(req.body);

  const contribution = submitVerifiedProductContribution({
    verifiedProductId: body.verifiedProductId,
    brand: body.brand ?? null,
    productName: body.productName,
    ingredients: body.ingredients.map((i) => ({
      name: i.name,
      mgAmount: i.mgAmount,
      timingWindow: "with_meal" as const,
    })),
    supplementFactsText: body.supplementFactsText ?? null,
  });

  const data = ContributeVerifiedProductResponse.parse({
    id: contribution.id,
    status: contribution.status,
    verifiedProductId: contribution.verifiedProductId,
    message: "Contribution submitted for review. It is not globally trusted until approved.",
  });
  res.status(201).json(data);
});

router.get("/products/popular", async (_req, res) => {
  const rows = await db.select().from(productsTable).where(eq(productsTable.popular, "yes")).limit(50);

  const data = ListPopularProductsResponse.parse(rows.map(toApiProduct));
  res.json(data);
});

export default router;
