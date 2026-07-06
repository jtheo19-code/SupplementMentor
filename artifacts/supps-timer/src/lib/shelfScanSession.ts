import type { ShelfDetectedProduct } from "@workspace/api-client-react";

export const SHELF_SCAN_SESSION_KEY = "sm_shelf_scan_review";
export const SHELF_SCAN_MAX_PRODUCTS = 12;

export interface ShelfReviewRow {
  id: string;
  productName: string;
  brand: string | null;
  confidence: number | null;
  labelEvidence: string | null;
  hasIngredientDetails: boolean;
  needsReview: boolean;
  ingredients: { name: string; mgAmount: number }[];
  included: boolean;
  isManual: boolean;
}

export function shelfDetectedToReviewRow(product: ShelfDetectedProduct): ShelfReviewRow {
  return {
    id: crypto.randomUUID(),
    productName: product.productName,
    brand: product.brand ?? null,
    confidence: product.confidence,
    labelEvidence: product.labelEvidence,
    hasIngredientDetails: product.hasIngredientDetails,
    needsReview: product.needsReview,
    ingredients: product.ingredients,
    included: true,
    isManual: false,
  };
}

export function createManualReviewRow(): ShelfReviewRow {
  return {
    id: crypto.randomUUID(),
    productName: "",
    brand: null,
    confidence: null,
    labelEvidence: null,
    hasIngredientDetails: false,
    needsReview: true,
    ingredients: [],
    included: true,
    isManual: true,
  };
}

export function saveShelfScanSession(products: ShelfDetectedProduct[]): void {
  sessionStorage.setItem(SHELF_SCAN_SESSION_KEY, JSON.stringify(products));
}

export function loadShelfScanSession(): ShelfDetectedProduct[] | null {
  const raw = sessionStorage.getItem(SHELF_SCAN_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ShelfDetectedProduct[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearShelfScanSession(): void {
  sessionStorage.removeItem(SHELF_SCAN_SESSION_KEY);
}
