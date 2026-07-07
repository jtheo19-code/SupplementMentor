import { openai } from "@workspace/integrations-openai-ai-server";
import { matchShelfDetection } from "./shelfProductMatch";
import { dedupeShelfProducts } from "./shelfScanDedupe";
import { getCachedShelfScan, setCachedShelfScan } from "./shelfScanCache";
import { logger } from "./logger";
import type { ShelfConfidenceScores, ShelfEnrichmentInfo } from "./verifiedProductRegistry";

export const SHELF_SCAN_MAX_PRODUCTS = 12;

export interface ShelfDetectedProduct {
  productName: string;
  brand: string | null;
  confidence: number;
  labelEvidence: string;
  rawOcrLines: string[];
  confidenceScores: ShelfConfidenceScores;
  enrichment: ShelfEnrichmentInfo;
  hasIngredientDetails: boolean;
  needsReview: boolean;
  ingredients: { name: string; mgAmount: number }[];
}

interface RawOcrBottle {
  rawOcrLines?: unknown;
  detectionConfidence?: unknown;
  ocrConfidence?: unknown;
}

interface RawShelfExtraction {
  bottles?: unknown;
}

type ShelfScanLog = Pick<typeof logger, "info" | "warn" | "error">;

function clampConfidence(value: unknown, fallback = 0.5): number {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) value = parsed;
    }
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function parseRawOcrLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseOcrBottle(raw: unknown): RawOcrBottle | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as RawOcrBottle;
}

const OCR_SYSTEM_PROMPT =
  "You read supplement shelf photos and extract verbatim label text per bottle. " +
  `Identify up to ${SHELF_SCAN_MAX_PRODUCTS} distinct supplement bottles left-to-right. ` +
  "Respond with strict JSON only in this exact shape: " +
  '{"bottles": [{"rawOcrLines": string[], "detectionConfidence": number, "ocrConfidence": number}]}. ' +
  "rawOcrLines: verbatim text visible on each bottle front label, one string per text line, top to bottom. " +
  "Include brand names, product names, and dose text exactly as printed. Do not interpret or normalize product names. " +
  "Do not invent text you cannot see. detectionConfidence: certainty the bottle exists. ocrConfidence: legibility of extracted text. " +
  "If no supplement bottles are visible, return {\"bottles\": []}.";

/**
 * Sends a shelf photo to a vision model for OCR-only bottle extraction, then
 * deterministically matches against verifiedProducts.json and the compound library.
 */
export async function scanShelfImage(
  imageBase64: string,
  mimeType: string,
  log: ShelfScanLog = logger,
): Promise<ShelfDetectedProduct[]> {
  const cached = getCachedShelfScan(imageBase64);
  if (cached) {
    log.info({ cacheHit: true, productCount: cached.length }, "[shelf-scan] cache hit");
    return cached;
  }

  log.info(
    {
      processedBase64Chars: imageBase64.length,
      processedBytesEstimate: Math.floor((imageBase64.length * 3) / 4),
      mimeType,
    },
    "[shelf-scan] request image metrics",
  );

  let content: string;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      temperature: 0,
      max_completion_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract verbatim front-label text for every supplement bottle in this shelf photo.",
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
    });

    content = response.choices[0]?.message?.content ?? "{}";
  } catch (err) {
    log.error({ err, openaiThrew: true }, "[shelf-scan] OpenAI request failed");
    throw err;
  }

  let jsonParsed = false;
  let parsed: RawShelfExtraction;
  try {
    parsed = JSON.parse(content) as RawShelfExtraction;
    jsonParsed = true;
  } catch {
    parsed = {};
    log.warn(
      { jsonParsed: false, rawContentLength: content.length },
      "[shelf-scan] raw response JSON parse failed",
    );
  }

  const rawBottles = Array.isArray(parsed.bottles)
    ? parsed.bottles.map(parseOcrBottle).filter((b): b is RawOcrBottle => b !== null)
    : [];

  const afterMatch = rawBottles.map((bottle) => {
    const rawOcrLines = parseRawOcrLines(bottle.rawOcrLines);
    const detectionConfidence = clampConfidence(bottle.detectionConfidence, 0.7);
    const ocrConfidence = clampConfidence(bottle.ocrConfidence, 0.6);
    const matched = matchShelfDetection({
      productName: rawOcrLines[0] ?? "Unknown product",
      brand: null,
      labelEvidence: rawOcrLines.join(" | "),
      rawOcrLines,
      visionIngredients: [],
      detectionConfidence,
      ocrConfidence,
    });

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
      ingredients: matched.ingredients.map((ing) => ({
        name: ing.name,
        mgAmount: ing.mgAmount,
      })),
    } satisfies ShelfDetectedProduct;
  });

  const products = dedupeShelfProducts(afterMatch).slice(0, SHELF_SCAN_MAX_PRODUCTS);

  log.info(
    {
      openaiThrew: false,
      jsonParsed,
      rawBottleCount: rawBottles.length,
      afterMatchCount: afterMatch.length,
      afterDedupCount: products.length,
      libraryMatchedCount: products.filter((p) => p.hasIngredientDetails).length,
      verifyIngredientsCount: products.filter((p) => p.enrichment.verifyIngredientsAvailable).length,
      rawContentLength: content.length,
      matchSummary: products.map((p) => ({
        productName: p.productName,
        brand: p.brand,
        hasIngredientDetails: p.hasIngredientDetails,
        verifyIngredientsAvailable: p.enrichment.verifyIngredientsAvailable,
        verifiedProductId: p.enrichment.verifiedProductId,
        ingredientNames: p.ingredients.map((i) => i.name),
        confidenceScores: p.confidenceScores,
      })),
    },
    "[shelf-scan] detection pipeline",
  );

  setCachedShelfScan(imageBase64, products);
  return products;
}

export { dedupeShelfProducts } from "./shelfScanDedupe";
