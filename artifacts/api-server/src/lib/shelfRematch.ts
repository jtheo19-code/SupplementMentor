import { matchShelfDetection, type ShelfMatchResult } from "./shelfProductMatch";
import type { ShelfDetectedProduct } from "./shelfScan";

export function shelfMatchResultToDetectedProduct(matched: ShelfMatchResult): ShelfDetectedProduct {
  return {
    productName: matched.productName,
    brand: matched.brand,
    confidence: matched.confidence,
    labelEvidence: matched.labelEvidence,
    rawOcrLines: matched.rawOcrLines,
    confidenceScores: matched.confidenceScores,
    enrichment: matched.enrichment,
    hasIngredientDetails: matched.hasIngredientDetails,
    needsReview: matched.needsReview,
    ingredients: matched.ingredients.map((ingredient) => ({
      name: ingredient.name,
      mgAmount: ingredient.mgAmount,
    })),
  };
}

export function buildRematchOcrLines(input: {
  productName: string;
  brand: string | null;
  rawOcrLines: string[];
}): string[] {
  const name = input.productName.trim();
  if (!name) return input.rawOcrLines;

  if (input.brand?.trim()) {
    return [input.brand.trim(), name];
  }

  if (input.rawOcrLines.length === 0) return [name];
  return [name, ...input.rawOcrLines.slice(1)];
}

export function rematchShelfRow(input: {
  productName: string;
  brand: string | null;
  rawOcrLines?: string[];
  detectionConfidence?: number;
  ocrConfidence?: number;
}): ShelfDetectedProduct {
  const rawOcrLines = buildRematchOcrLines({
    productName: input.productName,
    brand: input.brand,
    rawOcrLines: input.rawOcrLines ?? [],
  });

  const matched = matchShelfDetection({
    productName: input.productName.trim(),
    brand: input.brand,
    labelEvidence: rawOcrLines.join(" | "),
    rawOcrLines,
    visionIngredients: [],
    detectionConfidence: input.detectionConfidence ?? 0.75,
    ocrConfidence: input.ocrConfidence ?? 0.85,
  });

  return shelfMatchResultToDetectedProduct(matched);
}
