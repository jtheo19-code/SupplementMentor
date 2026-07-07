import type { ShelfDetectedProduct } from "@workspace/api-client-react";

export const SHELF_SCAN_SESSION_KEY = "sm_shelf_scan_review";
export const SHELF_VERIFY_INGREDIENTS_KEY = "sm_verify_ingredients";
export const SHELF_SCAN_MAX_PRODUCTS = 12;

export interface ShelfReviewRow {
  id: string;
  productName: string;
  brand: string | null;
  confidence: number | null;
  labelEvidence: string | null;
  rawOcrLines: string[];
  hasIngredientDetails: boolean;
  needsReview: boolean;
  verifyIngredientsAvailable: boolean;
  verifiedProductId: string | null;
  enrichmentStatus: string;
  ingredients: { name: string; mgAmount: number }[];
  included: boolean;
  isManual: boolean;
}

export interface VerifyIngredientsRequest {
  verifiedProductId: string;
  productName: string;
  brand: string | null;
}

export function shelfDetectedToReviewRow(product: ShelfDetectedProduct): ShelfReviewRow {
  return {
    id: crypto.randomUUID(),
    productName: product.productName,
    brand: product.brand ?? null,
    confidence: product.confidence,
    labelEvidence: product.labelEvidence,
    rawOcrLines: product.rawOcrLines ?? [],
    hasIngredientDetails: product.hasIngredientDetails,
    needsReview: product.needsReview,
    verifyIngredientsAvailable: product.enrichment?.verifyIngredientsAvailable ?? false,
    verifiedProductId: product.enrichment?.verifiedProductId ?? null,
    enrichmentStatus: product.enrichment?.status ?? "none",
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
    rawOcrLines: [],
    hasIngredientDetails: false,
    needsReview: true,
    verifyIngredientsAvailable: false,
    verifiedProductId: null,
    enrichmentStatus: "none",
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

export function saveVerifyIngredientsRequest(request: VerifyIngredientsRequest): void {
  sessionStorage.setItem(SHELF_VERIFY_INGREDIENTS_KEY, JSON.stringify(request));
}

export function loadVerifyIngredientsRequest(): VerifyIngredientsRequest | null {
  const raw = sessionStorage.getItem(SHELF_VERIFY_INGREDIENTS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VerifyIngredientsRequest;
  } catch {
    return null;
  }
}

export function clearVerifyIngredientsRequest(): void {
  sessionStorage.removeItem(SHELF_VERIFY_INGREDIENTS_KEY);
}
