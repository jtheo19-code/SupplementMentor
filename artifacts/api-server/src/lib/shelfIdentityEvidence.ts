import { normalizeIngredientName } from "./scanIngredients";

export const IDENTITY_ENRICHMENT_THRESHOLD = 0.85;
export const OCR_ENRICHMENT_THRESHOLD = 0.75;
export const DETECTION_ENRICHMENT_THRESHOLD = 0.75;

export type VitaminDesignator = "c" | "b12" | "d3";

export interface ParsedDose {
  amount: number;
  unit: "mg" | "mcg" | "iu" | "g";
}

export interface IdentityEvidenceResult {
  established: boolean;
  needsReview: boolean;
  reason: string | null;
}

function normalizeText(value: string): string {
  return normalizeIngredientName(value);
}

export function parseDosesFromText(text: string): ParsedDose[] {
  const doses: ParsedDose[] = [];
  const pattern = /(\d+(?:\.\d+)?)\s*(mg|mcg|iu|g)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    doses.push({
      amount,
      unit: match[2].toLowerCase() as ParsedDose["unit"],
    });
  }
  return doses;
}

function doseToMg(dose: ParsedDose): number | null {
  switch (dose.unit) {
    case "mg":
      return dose.amount;
    case "mcg":
      return dose.amount / 1000;
    case "g":
      return dose.amount * 1000;
    case "iu":
      return null;
    default:
      return null;
  }
}

export function dosesAreCompatible(ocrText: string, expectedAmountText: string): boolean {
  const ocrDoses = parseDosesFromText(ocrText);
  const expectedDoses = parseDosesFromText(expectedAmountText);
  if (ocrDoses.length === 0 || expectedDoses.length === 0) return true;

  for (const expected of expectedDoses) {
    const expectedMg = doseToMg(expected);
    if (expectedMg === null) continue;

    for (const ocrDose of ocrDoses) {
      const ocrMg = doseToMg(ocrDose);
      if (ocrMg === null) continue;

      if (ocrDose.unit !== expected.unit) {
        const looksLikeDigitOcrError =
          ocrDose.unit === "mcg" &&
          expected.unit === "mg" &&
          Math.abs(ocrDose.amount - expected.amount * 10) < 1;
        if (looksLikeDigitOcrError) return false;
      }

      const tolerance = Math.max(5, expectedMg * 0.05);
      if (Math.abs(ocrMg - expectedMg) <= tolerance) return true;
    }
  }

  return false;
}

export function hasVitaminCEvidence(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    /\bvitamin\s+c\b/.test(normalized) ||
    /\bascorbic\b/.test(normalized) ||
    /\bascorbate\b/.test(normalized)
  );
}

export function hasVitaminB12Evidence(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    /\bb12\b/.test(normalized) ||
    /\bb 12\b/.test(normalized) ||
    /\bcobalamin\b/.test(normalized) ||
    /\bmethylcobalamin\b/.test(normalized) ||
    /\bcyanocobalamin\b/.test(normalized)
  );
}

export function hasVitaminD3Evidence(text: string): boolean {
  const normalized = normalizeText(text);
  return /\bvitamin\s+d3\b/.test(normalized) || /\bd3\b/.test(normalized) || /\bcholecalciferol\b/.test(normalized);
}

export function detectVitaminDesignatorInText(text: string): VitaminDesignator | null {
  if (hasVitaminB12Evidence(text)) return "b12";
  if (hasVitaminD3Evidence(text)) return "d3";
  if (hasVitaminCEvidence(text)) return "c";
  return null;
}

export function inferVerifiedVitaminDesignator(productName: string, productId: string): VitaminDesignator | null {
  const normalized = normalizeText(`${productName} ${productId}`);
  if (normalized.includes("vitamin c") || productId.includes("vitamin-c")) return "c";
  if (normalized.includes("b12") || productId.includes("b12")) return "b12";
  if (normalized.includes("vitamin d3") || normalized.includes("d3") || productId.includes("vitamin-d3")) {
    return "d3";
  }
  return null;
}

export function ocrHadWeakVitaminDoseCorrection(originalLines: string[]): boolean {
  return originalLines.some(
    (line) =>
      /\bvitamin\s+10000\s+mcg\b/i.test(line) &&
      !hasVitaminCEvidence(line) &&
      !hasVitaminB12Evidence(line) &&
      !hasVitaminD3Evidence(line),
  );
}

export function assessVerifiedProductEvidence(input: {
  productId: string;
  productName: string;
  amounts: Array<{ name: string; amount: string }>;
  fingerprint: string;
  rawOcrLines: string[];
  originalOcrLines: string[];
  matchScore: number;
}): IdentityEvidenceResult {
  const combined = [input.fingerprint, ...input.rawOcrLines].join(" ");
  const originalCombined = input.originalOcrLines.join(" ");
  const designator = inferVerifiedVitaminDesignator(input.productName, input.productId);
  const ocrDesignator = detectVitaminDesignatorInText(combined);

  if (designator && ocrDesignator && designator !== ocrDesignator) {
    return {
      established: false,
      needsReview: true,
      reason: `conflicting vitamin designator (${ocrDesignator} vs ${designator})`,
    };
  }

  if (designator === "c") {
    if (!hasVitaminCEvidence(combined)) {
      return {
        established: false,
        needsReview: true,
        reason: "missing explicit Vitamin C evidence",
      };
    }
    const expectedAmount = input.amounts[0]?.amount ?? "1000 mg";
    if (!dosesAreCompatible(combined, expectedAmount)) {
      return {
        established: false,
        needsReview: true,
        reason: "Vitamin C dose/unit inconsistent with verified profile",
      };
    }
  }

  if (designator === "b12") {
    if (!hasVitaminB12Evidence(combined)) {
      return {
        established: false,
        needsReview: true,
        reason: "missing explicit Vitamin B12 evidence",
      };
    }
  }

  if (designator === "d3") {
    if (!hasVitaminD3Evidence(combined)) {
      return {
        established: false,
        needsReview: true,
        reason: "missing explicit Vitamin D3 evidence",
      };
    }
  }

  if (hasVitaminB12Evidence(combined) && designator !== "b12") {
    return {
      established: false,
      needsReview: true,
      reason: "OCR suggests Vitamin B12 but verified product is not B12",
    };
  }

  if (ocrHadWeakVitaminDoseCorrection(input.originalOcrLines)) {
    return {
      established: false,
      needsReview: true,
      reason: "weak OCR dose correction applied",
    };
  }

  if (input.matchScore < IDENTITY_ENRICHMENT_THRESHOLD) {
    return {
      established: false,
      needsReview: true,
      reason: "identity match score below enrichment threshold",
    };
  }

  if (designator && !ocrDesignator && /\bvitamin\b/.test(originalCombined)) {
    return {
      established: false,
      needsReview: true,
      reason: "generic vitamin text without reliable designator",
    };
  }

  return { established: true, needsReview: input.matchScore < IDENTITY_ENRICHMENT_THRESHOLD, reason: null };
}

export function canApplyIngredientEnrichment(input: {
  identityEstablished: boolean;
  needsReview: boolean;
  identityConfidence: number;
  ocrConfidence: number;
  detectionConfidence: number;
}): boolean {
  if (!input.identityEstablished) return false;
  if (input.needsReview) return false;
  if (input.identityConfidence < IDENTITY_ENRICHMENT_THRESHOLD) return false;
  if (input.ocrConfidence < OCR_ENRICHMENT_THRESHOLD) return false;
  if (input.detectionConfidence < DETECTION_ENRICHMENT_THRESHOLD) return false;
  return true;
}
