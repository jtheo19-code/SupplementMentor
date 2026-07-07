import type { StoredIngredient } from "@workspace/db";
import {
  findLibraryMatch,
  hasLibraryMatch,
  normalizeIngredientName,
  parseRawIngredients,
} from "./scanIngredients";
import {
  enrichFromVerifiedProduct,
  matchVerifiedProductIdentity,
  buildConfidenceScores,
  type ShelfEnrichmentInfo,
  type ShelfConfidenceScores,
} from "./verifiedProductRegistry";
import { canApplyIngredientEnrichment } from "./shelfIdentityEvidence";

export const SHELF_NEEDS_REVIEW_THRESHOLD = 0.75;

const BLEND_SPLIT = /\s+(?:with|and|&|\+|\/)\s+/i;

export interface ShelfMatchInput {
  productName: string;
  brand: string | null;
  labelEvidence: string;
  rawOcrLines: string[];
  visionIngredients: { name: string; mgAmount: number }[];
  detectionConfidence: number;
  ocrConfidence: number;
}

export interface ShelfMatchResult {
  productName: string;
  brand: string | null;
  labelEvidence: string;
  rawOcrLines: string[];
  ingredients: StoredIngredient[];
  hasIngredientDetails: boolean;
  needsReview: boolean;
  confidence: number;
  confidenceScores: ShelfConfidenceScores;
  enrichment: ShelfEnrichmentInfo;
}

function splitBlendSegments(productName: string): string[] {
  if (!BLEND_SPLIT.test(productName)) return [productName.trim()];
  return productName
    .split(BLEND_SPLIT)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function extractMgFromText(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*mg\b/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toMatchedIngredient(lib: StoredIngredient, doseText: string): StoredIngredient {
  const scannedMg = extractMgFromText(doseText);
  return {
    ...lib,
    name: lib.name,
    mgAmount: scannedMg && scannedMg > 0 ? scannedMg : lib.mgAmount,
  };
}

function matchCompoundLibrary(input: ShelfMatchInput): StoredIngredient[] {
  const doseText = [input.brand, input.productName, input.labelEvidence, ...input.rawOcrLines]
    .filter(Boolean)
    .join(" ");

  if (input.visionIngredients.length > 0) {
    const ingredients = parseRawIngredients(input.visionIngredients);
    if (ingredients.some((ing) => hasLibraryMatch(ing.name))) {
      return ingredients.filter((ing) => hasLibraryMatch(ing.name));
    }
  }

  const segmentHits: StoredIngredient[] = [];
  const seen = new Set<string>();
  for (const segment of splitBlendSegments(input.productName)) {
    const lib = findLibraryMatch(segment);
    if (!lib) continue;
    const key = normalizeIngredientName(lib.name);
    if (seen.has(key)) continue;
    seen.add(key);
    segmentHits.push(toMatchedIngredient(lib, doseText));
  }
  if (segmentHits.length > 0) return segmentHits;

  const single = findLibraryMatch(input.productName);
  if (single) return [toMatchedIngredient(single, doseText)];

  return [];
}

function stripIngredientEnrichment(enrichmentInfo: ShelfEnrichmentInfo): ShelfEnrichmentInfo {
  return {
    ...enrichmentInfo,
    status: enrichmentInfo.verifyIngredientsAvailable ? enrichmentInfo.status : "none",
    requiresReview: true,
  };
}

export function matchShelfDetection(input: ShelfMatchInput): ShelfMatchResult {
  const rawOcrLines =
    input.rawOcrLines.length > 0
      ? input.rawOcrLines
      : input.labelEvidence
        ? [input.labelEvidence]
        : [input.productName];

  const identity = matchVerifiedProductIdentity({
    rawOcrLines,
    detectionConfidence: input.detectionConfidence,
    ocrConfidence: input.ocrConfidence,
  });

  let enrichment = enrichFromVerifiedProduct(identity, {
    ocrConfidence: input.ocrConfidence,
    detectionConfidence: input.detectionConfidence,
  });
  let ingredients = enrichment.ingredients;
  let hasIngredientDetails = enrichment.hasIngredientDetails;
  let enrichmentConfidence = enrichment.enrichmentConfidence;
  let ingredientVerificationConfidence = enrichment.ingredientVerificationConfidence;
  let enrichmentInfo = enrichment.enrichment;

  const enrichmentAllowed = canApplyIngredientEnrichment({
    identityEstablished: identity.identityEstablished,
    needsReview: identity.needsReview,
    identityConfidence: identity.identityConfidence,
    ocrConfidence: input.ocrConfidence,
    detectionConfidence: input.detectionConfidence,
  });

  if (
    enrichmentAllowed &&
    !hasIngredientDetails &&
    !enrichmentInfo.verifyIngredientsAvailable
  ) {
    const compoundHits = matchCompoundLibrary({
      ...input,
      productName: identity.productName,
      brand: identity.brand,
      rawOcrLines,
    });
    if (compoundHits.length > 0) {
      ingredients = compoundHits;
      hasIngredientDetails = true;
      enrichmentConfidence = 0.75;
      ingredientVerificationConfidence = 0.6;
      enrichmentInfo = {
        status: "provisional",
        source: "compound_library",
        sourceUrl: null,
        verifyIngredientsAvailable: false,
        requiresReview: false,
        verifiedProductId: identity.record?.id ?? null,
      };
    }
  }

  let needsReview =
    identity.needsReview ||
    !identity.identityEstablished ||
    identity.identityConfidence < SHELF_NEEDS_REVIEW_THRESHOLD ||
    enrichmentInfo.requiresReview;

  if (!enrichmentAllowed || needsReview) {
    ingredients = [];
    hasIngredientDetails = false;
    enrichmentConfidence = 0;
    ingredientVerificationConfidence = 0;
    enrichmentInfo = stripIngredientEnrichment({
      ...enrichmentInfo,
      status: enrichmentInfo.verifyIngredientsAvailable ? enrichmentInfo.status : "none",
      requiresReview: true,
      verifiedProductId: enrichmentInfo.verifyIngredientsAvailable ? enrichmentInfo.verifiedProductId : null,
    });
    needsReview = true;
  }

  const confidenceScores = buildConfidenceScores({
    detectionConfidence: input.detectionConfidence,
    ocrConfidence: input.ocrConfidence,
    identityConfidence: identity.identityConfidence,
    enrichmentConfidence,
    ingredientVerificationConfidence,
  });

  return {
    productName: identity.productName,
    brand: identity.brand,
    labelEvidence: rawOcrLines.join(" | "),
    rawOcrLines,
    ingredients,
    hasIngredientDetails,
    needsReview,
    confidence: identity.identityConfidence,
    confidenceScores,
    enrichment: enrichmentInfo,
  };
}

/** @deprecated Use matchShelfDetection — kept for confirm-shelf fallback */
export function matchShelfProductToLibrary(input: {
  productName: string;
  brand: string | null;
  labelEvidence: string;
  visionIngredients: { name: string; mgAmount: number }[];
}): {
  productName: string;
  ingredients: StoredIngredient[];
  hasIngredientDetails: boolean;
  needsReview: boolean;
} {
  const result = matchShelfDetection({
    ...input,
    rawOcrLines: input.labelEvidence ? [input.labelEvidence] : [],
    detectionConfidence: 0.5,
    ocrConfidence: 0.5,
  });
  return {
    productName: result.productName,
    ingredients: result.ingredients,
    hasIngredientDetails: result.hasIngredientDetails,
    needsReview: result.needsReview,
  };
}
