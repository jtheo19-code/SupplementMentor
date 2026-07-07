import type { ShelfDetectedProduct } from "@workspace/api-client-react";

export const SHELF_SCAN_SESSION_KEY = "sm_shelf_scan_review";
export const SHELF_VERIFY_INGREDIENTS_KEY = "sm_verify_ingredients";
export const SHELF_SCAN_MAX_PRODUCTS = 12;

export type IngredientSource =
  | "none"
  | "verified"
  | "matched"
  | "label_scan"
  | "web_search"
  | "manual";

export type WebEnrichmentState = "idle" | "searching" | "not_found";

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
  webEnrichmentState: WebEnrichmentState;
  autoWebSearchAttempted: boolean;
  rematchPending: boolean;
}

export interface VerifyIngredientsRequest {
  verifiedProductId: string;
  productName: string;
  brand: string | null;
}

export function mapDetectedIngredientSource(product: ShelfDetectedProduct): IngredientSource {
  if (!product.hasIngredientDetails || product.needsReview) return "none";
  if (product.enrichment?.status === "verified") return "verified";
  if (product.enrichment?.status === "provisional") return "matched";
  return "none";
}

export function isRecognizedCommercialProduct(product: ShelfDetectedProduct): boolean {
  return (
    Boolean(product.enrichment?.verifiedProductId) ||
    Boolean(product.enrichment?.verifyIngredientsAvailable)
  );
}

export function rowNeedsTrustedIngredients(row: ShelfReviewRow): boolean {
  if (row.ingredientsSkipped || row.hasIngredientDetails) return false;
  return shouldShowIngredientVerificationActions(row) || row.needsReview;
}

export function shouldShowIngredientVerificationActions(row: ShelfReviewRow): boolean {
  if (row.ingredientsSkipped || row.hasIngredientDetails) return false;
  if (row.verifyIngredientsAvailable) return true;
  if (row.verifiedProductId && row.enrichmentStatus !== "verified") return true;
  return row.ingredientsNeedVerification;
}

export function shouldAutoWebEnrich(row: ShelfReviewRow): boolean {
  if (!shouldShowIngredientVerificationActions(row)) return false;
  if (!row.verifiedProductId) return false;
  if (row.autoWebSearchAttempted) return false;
  if (row.webEnrichmentState !== "idle") return false;
  return true;
}

export function applyMatchMetadataToReviewRow(
  row: ShelfReviewRow,
  product: ShelfDetectedProduct,
): ShelfReviewRow {
  const verifiedProductId = product.enrichment?.verifiedProductId ?? null;
  const verifyIngredientsAvailable = product.enrichment?.verifyIngredientsAvailable ?? false;
  const enrichmentStatus = product.enrichment?.status ?? "none";
  const recognizedProduct = isRecognizedCommercialProduct(product);

  return {
    ...row,
    productName: product.productName,
    brand: product.brand ?? null,
    confidence: product.confidence,
    labelEvidence: product.labelEvidence,
    rawOcrLines: product.rawOcrLines ?? [],
    needsReview: product.needsReview,
    recognizedProduct,
    ingredientsNeedVerification:
      !product.hasIngredientDetails &&
      Boolean(verifiedProductId) &&
      enrichmentStatus !== "verified",
    verifyIngredientsAvailable,
    verifiedProductId,
    enrichmentStatus,
    rematchPending: false,
  };
}

export function shelfDetectedToReviewRow(product: ShelfDetectedProduct): ShelfReviewRow {
  const verifiedProductId = product.enrichment?.verifiedProductId ?? null;
  const verifyIngredientsAvailable = product.enrichment?.verifyIngredientsAvailable ?? false;
  const enrichmentStatus = product.enrichment?.status ?? "none";
  const recognizedProduct = isRecognizedCommercialProduct(product);
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
    webEnrichmentState: "idle",
    autoWebSearchAttempted: false,
    rematchPending: false,
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
    webEnrichmentState: "idle",
    autoWebSearchAttempted: false,
    rematchPending: false,
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

export function ingredientSourceLabel(source: IngredientSource): string {
  switch (source) {
    case "verified":
      return "from verified product data";
    case "matched":
      return "matched from supplement library";
    case "label_scan":
    case "web_search":
    case "manual":
      return "confirmed from your review";
    default:
      return "for timing analysis";
  }
}

export function isUserConfirmedIngredientSource(source: IngredientSource): boolean {
  return source === "label_scan" || source === "web_search" || source === "manual";
}
