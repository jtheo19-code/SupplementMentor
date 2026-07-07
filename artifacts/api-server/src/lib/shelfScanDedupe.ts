import { normalizeIngredientName } from "./scanIngredients";

export interface ShelfDedupeProduct {
  productName: string;
  brand: string | null;
  confidence: number;
}

function shelfProductDedupKey(brand: string | null, productName: string): string {
  const combined = brand ? `${brand} ${productName}` : productName;
  return normalizeIngredientName(combined);
}

function areNearDuplicateKeys(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (longer.includes(shorter) && shorter.length / longer.length >= 0.8) {
    return true;
  }

  const tokensA = a.split(" ").filter(Boolean);
  const tokensB = b.split(" ").filter(Boolean);
  const tokenSetB = new Set(tokensB);
  const intersection = tokensA.filter((token) => tokenSetB.has(token)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 && intersection / union >= 0.85;
}

export function dedupeShelfProducts<T extends ShelfDedupeProduct>(products: T[]): T[] {
  const kept: T[] = [];

  for (const product of products) {
    const key = shelfProductDedupKey(product.brand, product.productName);
    const matchIndex = kept.findIndex((existing) =>
      areNearDuplicateKeys(key, shelfProductDedupKey(existing.brand, existing.productName)),
    );

    if (matchIndex === -1) {
      kept.push(product);
      continue;
    }

    if (product.confidence > kept[matchIndex].confidence) {
      kept[matchIndex] = product;
    }
  }

  return kept;
}
