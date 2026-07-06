import { randomUUID } from "node:crypto";
import { db, productsTable, type ProductRow, type StoredIngredient } from "@workspace/db";

export function formatScannedProductName(productName: string, brand: string | null): string {
  const name = productName.trim();
  if (!brand?.trim()) return name;
  const brandTrimmed = brand.trim();
  if (normalizeForCompare(name).includes(normalizeForCompare(brandTrimmed))) {
    return name;
  }
  return `${brandTrimmed} ${name}`;
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

export function ingredientsForConfirmedShelfItem(
  productName: string,
  ingredients: { name: string; mgAmount: number }[],
): StoredIngredient[] {
  if (ingredients.length > 0) {
    return ingredients.map((i) => ({
      name: i.name,
      mgAmount: i.mgAmount,
      timingWindow: "with_meal" as const,
    }));
  }
  return [
    {
      name: productName.trim(),
      mgAmount: 0,
      timingWindow: "flexible",
    },
  ];
}

export async function insertScannedProduct(
  name: string,
  ingredients: StoredIngredient[],
  badge: string,
  idPrefix: string,
): Promise<ProductRow> {
  const [row] = await db
    .insert(productsTable)
    .values({
      id: `${idPrefix}-${randomUUID()}`,
      name,
      type: ingredients.length > 1 ? "blend" : "standalone",
      badge,
      ingredients,
      popular: "no",
    })
    .returning();

  if (!row) {
    throw new Error("Failed to insert scanned product.");
  }

  return row;
}
