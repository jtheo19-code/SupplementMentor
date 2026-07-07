import type { StoredIngredient } from "@workspace/db";

const DAY_MS = 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const pageTextCache = new Map<string, CacheEntry<string>>();
const extractionCache = new Map<string, CacheEntry<StoredIngredient[]>>();

function readCache<T>(store: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache<T>(store: Map<string, CacheEntry<T>>, key: string, value: T): void {
  store.set(key, { value, expiresAt: Date.now() + DAY_MS });
}

export function pageTextCacheKey(verifiedProductId: string, url: string): string {
  return `${verifiedProductId}::${url}`;
}

export function extractionCacheKey(
  verifiedProductId: string,
  url: string,
  brand: string | null,
  productName: string,
): string {
  return `${verifiedProductId}::${url}::${brand ?? ""}::${productName}`;
}

export function getCachedPageText(key: string): string | null {
  return readCache(pageTextCache, key);
}

export function setCachedPageText(key: string, text: string): void {
  writeCache(pageTextCache, key, text);
}

export function getCachedExtraction(key: string): StoredIngredient[] | null {
  return readCache(extractionCache, key);
}

export function setCachedExtraction(key: string, ingredients: StoredIngredient[]): void {
  writeCache(extractionCache, key, ingredients);
}
