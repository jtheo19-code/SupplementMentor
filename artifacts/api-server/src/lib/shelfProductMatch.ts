import type { StoredIngredient } from "@workspace/db";
import { INGREDIENT_LIBRARY } from "./ingredientLibrary";
import {
  findLibraryMatch,
  hasLibraryMatch,
  normalizeIngredientName,
  parseRawIngredients,
} from "./scanIngredients";

const LIBRARY_BY_NAME_LENGTH = [...INGREDIENT_LIBRARY].sort(
  (a, b) => b.name.length - a.name.length,
);

const BLEND_SPLIT = /\s+(?:with|and|&|\+|\/)\s+/i;

const SHELF_PRODUCT_ALIASES: Array<{
  test: (text: string) => boolean;
  ingredientNames: string[];
}> = [
  {
    test: (t) => /quercetin/i.test(t) && /bromelain/i.test(t),
    ingredientNames: ["Quercetin", "Bromelain"],
  },
  {
    test: (t) => /calcium\s*d[\s-]*glucarate/i.test(t),
    ingredientNames: ["Calcium D-glucarate"],
  },
  {
    test: (t) => /\bl[\s-]*theanine\b/i.test(t),
    ingredientNames: ["L-theanine"],
  },
  {
    test: (t) => /\bvitamin\s*c\b|ascorbic\s*acid/i.test(t),
    ingredientNames: ["Vitamin C"],
  },
  {
    test: (t) => /travelbiotic|bb536|bifidobacterium\s*longum/i.test(t),
    ingredientNames: ["Bifidobacterium longum"],
  },
  {
    test: (t) => /tributyrin|butyrate\s*builder/i.test(t),
    ingredientNames: ["Tributyrin (butyrate)"],
  },
];

export interface ShelfMatchInput {
  productName: string;
  brand: string | null;
  labelEvidence: string;
  visionIngredients: { name: string; mgAmount: number }[];
}

export interface ShelfMatchResult {
  productName: string;
  ingredients: StoredIngredient[];
  hasIngredientDetails: boolean;
  needsReview: boolean;
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

function addUniqueIngredient(
  results: StoredIngredient[],
  seen: Set<string>,
  ingredient: StoredIngredient,
): void {
  const key = normalizeIngredientName(ingredient.name);
  if (seen.has(key)) return;
  seen.add(key);
  results.push(ingredient);
}

function splitBlendSegments(productName: string): string[] {
  if (!BLEND_SPLIT.test(productName)) return [productName.trim()];
  return productName
    .split(BLEND_SPLIT)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function matchAliasRules(combinedText: string, doseText: string): StoredIngredient[] {
  const results: StoredIngredient[] = [];
  const seen = new Set<string>();

  for (const rule of SHELF_PRODUCT_ALIASES) {
    if (!rule.test(combinedText)) continue;
    for (const ingredientName of rule.ingredientNames) {
      const lib = INGREDIENT_LIBRARY.find((ing) => ing.name === ingredientName);
      if (lib) {
        addUniqueIngredient(results, seen, toMatchedIngredient(lib, doseText));
      }
    }
    if (results.length > 0) return results;
  }

  return results;
}

function matchSegments(segments: string[], doseText: string): StoredIngredient[] {
  const results: StoredIngredient[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    const lib = findLibraryMatch(segment);
    if (lib) {
      addUniqueIngredient(results, seen, toMatchedIngredient(lib, doseText));
    }
  }

  return results;
}

function matchEmbeddedLibraryNames(combinedText: string, doseText: string): StoredIngredient[] {
  const normalizedCombined = normalizeIngredientName(combinedText);
  const results: StoredIngredient[] = [];
  const seen = new Set<string>();

  for (const lib of LIBRARY_BY_NAME_LENGTH) {
    const libNormalized = normalizeIngredientName(lib.name);
    if (libNormalized.length < 4) continue;
    if (!normalizedCombined.includes(libNormalized)) continue;
    addUniqueIngredient(results, seen, toMatchedIngredient(lib, doseText));
  }

  return results;
}

/**
 * Resolve Estro-Cort vs Cort-Eaze from label text only — never guess either name.
 */
export function resolveShelfProductName(
  productName: string,
  labelEvidence: string,
): { productName: string; needsReview: boolean } {
  const evidence = labelEvidence.trim();
  const evidenceNorm = evidence.toLowerCase();
  const estroInEvidence = /estro[\s-]*cort/i.test(evidence);
  const cortEazeInEvidence = /cort[\s-]*eaze/i.test(evidence);

  if (estroInEvidence && !cortEazeInEvidence) {
    return { productName: "Estro-Cort", needsReview: false };
  }
  if (cortEazeInEvidence && !estroInEvidence) {
    return { productName: "Cort-Eaze", needsReview: false };
  }
  if (estroInEvidence && cortEazeInEvidence) {
    return { productName: productName.trim(), needsReview: true };
  }

  const nameNorm = productName.toLowerCase();
  if (
    (nameNorm.includes("estro") || nameNorm.includes("cort")) &&
    !estroInEvidence &&
    !cortEazeInEvidence
  ) {
    return { productName: productName.trim(), needsReview: true };
  }

  return { productName: productName.trim(), needsReview: false };
}

function finalizeMatchResult(
  productName: string,
  ingredients: StoredIngredient[],
  needsReview: boolean,
): ShelfMatchResult {
  const libraryBacked = ingredients.filter((ing) => hasLibraryMatch(ing.name));
  return {
    productName,
    ingredients: libraryBacked,
    hasIngredientDetails: libraryBacked.length > 0,
    needsReview,
  };
}

/**
 * Match a shelf-detected product to known library ingredients for timing/interactions.
 * Vision-parsed label ingredients take priority; otherwise infer from name + evidence.
 */
export function matchShelfProductToLibrary(input: ShelfMatchInput): ShelfMatchResult {
  const resolved = resolveShelfProductName(input.productName, input.labelEvidence);
  const doseText = [input.brand, resolved.productName, input.labelEvidence]
    .filter(Boolean)
    .join(" ");
  const combinedText = doseText;

  if (input.visionIngredients.length > 0) {
    const ingredients = parseRawIngredients(input.visionIngredients);
    const hasLibrary = ingredients.some((ing) => hasLibraryMatch(ing.name));
    if (hasLibrary) {
      return finalizeMatchResult(resolved.productName, ingredients, resolved.needsReview);
    }
  }

  const aliasHits = matchAliasRules(combinedText, doseText);
  if (aliasHits.length > 0) {
    return finalizeMatchResult(resolved.productName, aliasHits, resolved.needsReview);
  }

  const segmentHits = matchSegments(splitBlendSegments(resolved.productName), doseText);
  if (segmentHits.length > 0) {
    return finalizeMatchResult(resolved.productName, segmentHits, resolved.needsReview);
  }

  const singleHit = findLibraryMatch(resolved.productName);
  if (singleHit) {
    return finalizeMatchResult(
      resolved.productName,
      [toMatchedIngredient(singleHit, doseText)],
      resolved.needsReview,
    );
  }

  const embeddedHits = matchEmbeddedLibraryNames(combinedText, doseText);
  if (embeddedHits.length > 0) {
    return finalizeMatchResult(resolved.productName, embeddedHits, resolved.needsReview);
  }

  return {
    productName: resolved.productName,
    ingredients: [],
    hasIngredientDetails: false,
    needsReview: resolved.needsReview,
  };
}
