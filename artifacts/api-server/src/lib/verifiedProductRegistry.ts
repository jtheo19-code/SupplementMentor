import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StoredIngredient } from "@workspace/db";
import { getApprovedContributionIngredients } from "./verifiedProductContributions";
import { normalizeIngredientName, parseRawIngredients } from "./scanIngredients";
import { isGenericProductName, pickBestOcrProductLine } from "./shelfGenericTerms";
import { normalizeShelfOcrLines } from "./shelfOcrNormalize";
import {
  assessVerifiedProductEvidence,
  IDENTITY_ENRICHMENT_THRESHOLD,
  OCR_ENRICHMENT_THRESHOLD,
  DETECTION_ENRICHMENT_THRESHOLD,
  type IdentityEvidenceResult,
} from "./shelfIdentityEvidence";
import { resolveApiDataDir } from "./apiDataPath";

export type EnrichmentStatus = "verified" | "provisional" | "pending" | "none";

export interface VerifiedProductRecord {
  id: string;
  brand: string | null;
  productName: string;
  aliases: string[];
  upc: string | null;
  gtin: string | null;
  ean: string | null;
  supplementFacts: string | null;
  ingredients: { name: string; mgAmount: number }[];
  amounts: Array<{ name: string; amount: string }>;
  officialUrl: string | null;
  alternateUrls: string[];
  imageFingerprints: string[];
  ocrFingerprints: string[];
  frontLabelImage: string | null;
  backLabelImage: string | null;
  supplementFactsImage: string | null;
  verificationSource: string;
  verificationDate: string;
  userConfirmationCount: number;
  enrichmentStatus: EnrichmentStatus;
  globallyTrusted: boolean;
}

export interface ShelfConfidenceScores {
  detection: number;
  ocr: number;
  identity: number;
  enrichment: number;
  ingredientVerification: number;
}

export interface ShelfEnrichmentInfo {
  status: EnrichmentStatus;
  source: string | null;
  sourceUrl: string | null;
  verifyIngredientsAvailable: boolean;
  requiresReview: boolean;
  verifiedProductId: string | null;
}

export interface IdentityMatchResult {
  record: VerifiedProductRecord | null;
  identityConfidence: number;
  identityEstablished: boolean;
  brand: string | null;
  productName: string;
  needsReview: boolean;
  evidenceReason: string | null;
}

export interface EnrichmentMatchResult {
  ingredients: StoredIngredient[];
  hasIngredientDetails: boolean;
  enrichment: ShelfEnrichmentInfo;
  enrichmentConfidence: number;
  ingredientVerificationConfidence: number;
}

const verifiedProductsPath = join(resolveApiDataDir(), "verifiedProducts.json");

let cachedProducts: VerifiedProductRecord[] | null = null;

export function loadVerifiedProducts(): VerifiedProductRecord[] {
  if (cachedProducts) return cachedProducts;
  const raw = readFileSync(verifiedProductsPath, "utf8");
  const parsed = JSON.parse(raw) as { products: VerifiedProductRecord[] };
  cachedProducts = parsed.products;
  return cachedProducts;
}

/** @internal Test helper */
export function resetVerifiedProductsCache(): void {
  cachedProducts = null;
}

function normalizeText(value: string): string {
  return normalizeIngredientName(value);
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(" ").filter(Boolean);
}

function buildOcrFingerprint(rawOcrLines: string[]): string {
  return normalizeText(rawOcrLines.join(" "));
}

function extractBarcodeDigits(rawOcrLines: string[]): string | null {
  const combined = rawOcrLines.join(" ");
  const match = combined.match(/\b(\d{12,14})\b/);
  return match?.[1] ?? null;
}

const VERIFIED_MATCH_THRESHOLD = 0.72;

function buildEstablishedIdentity(
  record: VerifiedProductRecord,
  matchScore: number,
  evidence: IdentityEvidenceResult,
): IdentityMatchResult {
  const needsReview = evidence.needsReview || matchScore < IDENTITY_ENRICHMENT_THRESHOLD;
  return {
    record: evidence.established ? record : null,
    identityEstablished: evidence.established,
    identityConfidence: evidence.established ? Math.min(0.97, matchScore) : Math.min(0.7, matchScore),
    brand: record.brand,
    productName: record.productName,
    needsReview,
    evidenceReason: evidence.reason,
  };
}

function buildTentativeIdentity(
  record: VerifiedProductRecord,
  matchScore: number,
  evidence: IdentityEvidenceResult,
): IdentityMatchResult {
  return {
    record: null,
    identityEstablished: false,
    identityConfidence: Math.min(0.7, matchScore),
    brand: record.brand,
    productName: record.productName,
    needsReview: true,
    evidenceReason: evidence.reason,
  };
}

function productAliasTokens(alias: string, brand: string | null): string[] {
  let productPart = normalizeText(alias);
  if (brand) {
    const brandNorm = normalizeText(brand);
    if (productPart.startsWith(`${brandNorm} `)) {
      productPart = productPart.slice(brandNorm.length + 1);
    }
  }
  return tokenize(productPart);
}

function scoreAliasMatch(fingerprint: string, alias: string, brand: string | null): number {
  const aliasNorm = normalizeText(alias);
  if (!aliasNorm) return 0;
  if (fingerprint === aliasNorm) return 1;
  if (fingerprint.includes(aliasNorm)) return 0.95;

  const aliasTokens = productAliasTokens(alias, brand);
  const fpTokens = new Set(tokenize(fingerprint));
  if (aliasTokens.length === 0) return 0;
  const overlap = aliasTokens.filter((token) => fpTokens.has(token)).length;
  return overlap / aliasTokens.length;
}

export function matchVerifiedProductIdentity(input: {
  rawOcrLines: string[];
  detectionConfidence: number;
  ocrConfidence: number;
}): IdentityMatchResult {
  const originalOcrLines = input.rawOcrLines;
  const normalizedLines = normalizeShelfOcrLines(originalOcrLines);
  const fingerprint = buildOcrFingerprint(normalizedLines);
  const fallbackName = pickBestOcrProductLine(normalizedLines);
  let best: { record: VerifiedProductRecord; score: number } | null = null;

  const barcode = extractBarcodeDigits(normalizedLines);
  for (const record of loadVerifiedProducts()) {
    if (!record.globallyTrusted) continue;

    if (barcode && (record.upc === barcode || record.gtin === barcode || record.ean === barcode)) {
      return {
        record,
        identityEstablished: true,
        identityConfidence: 1,
        brand: record.brand,
        productName: record.productName,
        needsReview: false,
        evidenceReason: null,
      };
    }

    for (const existingFp of record.ocrFingerprints) {
      if (existingFp === fingerprint) {
        return {
          record,
          identityEstablished: true,
          identityConfidence: 0.98,
          brand: record.brand,
          productName: record.productName,
          needsReview: false,
          evidenceReason: null,
        };
      }
    }

    const aliasScores = [record.productName, ...(record.aliases ?? [])].map((alias) =>
      scoreAliasMatch(fingerprint, alias, record.brand),
    );
    const brandBoost =
      record.brand && fingerprint.includes(normalizeText(record.brand)) ? 0.08 : 0;
    const score = Math.min(1, Math.max(...aliasScores, 0) + brandBoost);

    if (score >= VERIFIED_MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { record, score };
    }
  }

  if (best) {
    const evidence = assessVerifiedProductEvidence({
      productId: best.record.id,
      productName: best.record.productName,
      amounts: best.record.amounts,
      fingerprint,
      rawOcrLines: normalizedLines,
      originalOcrLines,
      matchScore: best.score,
    });
    if (evidence.established) {
      return buildEstablishedIdentity(best.record, best.score, evidence);
    }
    return buildTentativeIdentity(best.record, best.score, evidence);
  }

  const safeName = isGenericProductName(fallbackName) ? "Unknown product" : fallbackName;
  return {
    record: null,
    identityEstablished: false,
    identityConfidence: safeName === "Unknown product" ? 0.2 : 0.45,
    brand: null,
    productName: safeName,
    needsReview: true,
    evidenceReason: safeName === "Unknown product" ? "generic label text" : "no verified product match",
  };
}

function ingredientsFromRecord(record: VerifiedProductRecord): StoredIngredient[] {
  const approvedContribution = getApprovedContributionIngredients(record.id);
  if (approvedContribution && approvedContribution.length > 0) {
    return approvedContribution;
  }
  return parseRawIngredients(record.ingredients);
}

export function enrichFromVerifiedProduct(
  identity: IdentityMatchResult,
  input: { ocrConfidence: number; detectionConfidence: number },
): EnrichmentMatchResult {
  if (!identity.record || !identity.identityEstablished) {
    return {
      ingredients: [],
      hasIngredientDetails: false,
      enrichmentConfidence: 0,
      ingredientVerificationConfidence: 0,
      enrichment: {
        status: "none",
        source: null,
        sourceUrl: null,
        verifyIngredientsAvailable: false,
        requiresReview: true,
        verifiedProductId: null,
      },
    };
  }

  const record = identity.record;
  const ingredients = ingredientsFromRecord(record);
  const hasVerifiedIngredients =
    record.enrichmentStatus === "verified" && ingredients.length > 0 && record.globallyTrusted;
  const canAttachVerifiedIngredients =
    hasVerifiedIngredients &&
    !identity.needsReview &&
    identity.identityConfidence >= IDENTITY_ENRICHMENT_THRESHOLD &&
    input.ocrConfidence >= OCR_ENRICHMENT_THRESHOLD &&
    input.detectionConfidence >= DETECTION_ENRICHMENT_THRESHOLD;

  if (canAttachVerifiedIngredients) {
    return {
      ingredients,
      hasIngredientDetails: true,
      enrichmentConfidence: 0.95,
      ingredientVerificationConfidence: record.verificationSource === "admin_seed" ? 0.9 : 0.85,
      enrichment: {
        status: "verified",
        source: "verified_products_json",
        sourceUrl: record.officialUrl,
        verifyIngredientsAvailable: false,
        requiresReview: false,
        verifiedProductId: record.id,
      },
    };
  }

  return {
    ingredients: [],
    hasIngredientDetails: false,
    enrichmentConfidence: 0.1,
    ingredientVerificationConfidence: 0,
    enrichment: {
      status: hasVerifiedIngredients ? "pending" : "pending",
      source: "verified_products_json",
      sourceUrl: record.officialUrl,
      verifyIngredientsAvailable: !hasVerifiedIngredients,
      requiresReview: identity.needsReview,
      verifiedProductId: record.id,
    },
  };
}

export function buildConfidenceScores(input: {
  detectionConfidence: number;
  ocrConfidence: number;
  identityConfidence: number;
  enrichmentConfidence: number;
  ingredientVerificationConfidence: number;
}): ShelfConfidenceScores {
  return {
    detection: input.detectionConfidence,
    ocr: input.ocrConfidence,
    identity: input.identityConfidence,
    enrichment: input.enrichmentConfidence,
    ingredientVerification: input.ingredientVerificationConfidence,
  };
}
