import { createHash } from "node:crypto";
import type { ShelfDetectedProduct } from "./shelfScan";

export const SHELF_PIPELINE_VERSION = "shelf-v3";

const cache = new Map<string, ShelfDetectedProduct[]>();

function cacheKey(imageBase64: string): string {
  const hash = createHash("sha256").update(imageBase64).digest("hex");
  return `${SHELF_PIPELINE_VERSION}:${hash}`;
}

export function getCachedShelfScan(imageBase64: string): ShelfDetectedProduct[] | null {
  const hit = cache.get(cacheKey(imageBase64));
  return hit ? hit.map((product) => ({ ...product, ingredients: [...product.ingredients] })) : null;
}

export function setCachedShelfScan(imageBase64: string, products: ShelfDetectedProduct[]): void {
  cache.set(
    cacheKey(imageBase64),
    products.map((product) => ({ ...product, ingredients: [...product.ingredients] })),
  );
}

export function clearShelfScanCache(): void {
  cache.clear();
}

/** @internal Test helper */
export function shelfScanCacheSize(): number {
  return cache.size;
}
