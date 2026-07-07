import type { ShelfDetectedProduct } from "@workspace/api-client-react";

export const SHELF_SCAN_SESSION_KEY = "sm_shelf_scan_review";
export const SHELF_VERIFY_INGREDIENTS_KEY = "sm_verify_ingredients";
export const SHELF_SCAN_MAX_PRODUCTS = 12;

export type IngredientSource = "none" | "verified" | "matched" | "label_scan" | "web_search";

export interface ShelfReviewRow {
  id: string;
  productName: string;
  brand: string | null;
  confidence: number | null;
  labelEvidence: string | null;
  rawOcrLines: string[];
  hasIngredientDetails: boolean;
  needsReview: boolean;
  recognizedProduct: boolean;
  ingredientsNeedVerification: boolean;
  ingredientsSkipped: boolean;
  verifyIngredientsAvailable: boolean;
  verifiedProductId: string | null;
  enrichmentStatus: string;
  ingredientSource: IngredientSource;
  confirmedSourceLabel: string | null;
  confirmedSourceUrl: string | null;
  ingredients: { name: string; mgAmount: number }[];
  included: boolean;
  isManual: boolean;
}

export interface VerifyIngredientsRequest {
  verifiedProductId: string;
  productName: string;
  brand: string | null;
}

function mapDetectedIngredientSource(product: ShelfDetectedProduct): IngredientSource {
  if (!product.hasIngredientDetails || product.needsReview) return "none";
  if (product.enrichment?.status === "verified") return "verified";
  if (product.enrichment?.status === "provisional") return "matched";
  return "none";
}

export function shouldShowIngredientVerificationActions(row: ShelfReviewRow): boolean {
  if (row.ingredientsSkipped || row.hasIngredientDetails) return false;
  if (row.verifyIngredientsAvailable) return true;
  if (row.verifiedProductId && row.enrichmentStatus !== "verified") return true;
  return row.ingredientsNeedVerification;
}

export function shelfDetectedToReviewRow(product: ShelfDetectedProduct): ShelfReviewRow {
  const verifiedProductId = product.enrichment?.verifiedProductId ?? null;
  const verifyIngredientsAvailable = product.enrichment?.verifyIngredientsAvailable ?? false;
  const enrichmentStatus = product.enrichment?.status ?? "none";
  const recognizedProduct = Boolean(verifiedProductId) || verifyIngredientsAvailable;
  const ingredientsNeedVerification =
    !product.hasIngredientDetails &&
    Boolean(verifiedProductId) &&
    enrichmentStatus !== "verified";

  return {
    id: crypto.randomUUID(),
    productName: product.productName,
    brand: product.brand ?? null,
    confidence: product.confidence,
    labelEvidence: product.labelEvidence,
    rawOcrLines: product.rawOcrLines ?? [],
    hasIngredientDetails: product.hasIngredientDetails,
    needsReview: product.needsReview,
    recognizedProduct,
    ingredientsNeedVerification,
    ingredientsSkipped: false,
    verifyIngredientsAvailable,
    verifiedProductId,
    enrichmentStatus,
    ingredientSource: mapDetectedIngredientSource(product),
    confirmedSourceLabel: null,
    confirmedSourceUrl: null,
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
    recognizedProduct: false,
    ingredientsNeedVerification: false,
    ingredientsSkipped: false,
    verifyIngredientsAvailable: false,
    verifiedProductId: null,
    enrichmentStatus: "none",
    ingredientSource: "none",
    confirmedSourceLabel: null,
    confirmedSourceUrl: null,
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
