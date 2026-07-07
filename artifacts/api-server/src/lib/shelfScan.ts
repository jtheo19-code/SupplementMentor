import { openai } from "@workspace/integrations-openai-ai-server";
import { normalizeIngredientName, parseRawIngredients } from "./scanIngredients";
import { matchShelfProductToLibrary } from "./shelfProductMatch";
import { logger } from "./logger";

export const SHELF_SCAN_MAX_PRODUCTS = 12;
export const SHELF_NEEDS_REVIEW_THRESHOLD = 0.75;

export interface ShelfDetectedProduct {
  productName: string;
  brand: string | null;
  confidence: number;
  labelEvidence: string;
  hasIngredientDetails: boolean;
  needsReview: boolean;
  ingredients: { name: string; mgAmount: number }[];
}

interface RawShelfProduct {
  productName?: unknown;
  brand?: unknown;
  confidence?: unknown;
  labelEvidence?: unknown;
  ingredients?: unknown;
}

interface RawShelfExtraction {
  products?: unknown;
}

type ShelfScanLog = Pick<typeof logger, "info" | "warn" | "error">;

function pickStringField(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function normalizeRawShelfProduct(raw: unknown): RawShelfProduct {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  return {
    productName:
      pickStringField(record, ["productName", "product_name", "name", "supplementName"]) ||
      undefined,
    brand: record.brand,
    confidence: record.confidence,
    labelEvidence:
      pickStringField(record, ["labelEvidence", "label_evidence", "evidence"]) || undefined,
    ingredients: record.ingredients,
  };
}

function clampConfidence(value: unknown): number {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        value = parsed;
      }
    }
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function parseShelfProduct(raw: RawShelfProduct): ShelfDetectedProduct | null {
  const normalized = normalizeRawShelfProduct(raw);
  const productName =
    typeof normalized.productName === "string" ? normalized.productName.trim() : "";
  if (!productName) return null;

  const brand =
    typeof normalized.brand === "string" && normalized.brand.trim().length > 0
      ? normalized.brand.trim()
      : null;
  const confidence = clampConfidence(normalized.confidence);
  const labelEvidence =
    typeof normalized.labelEvidence === "string" && normalized.labelEvidence.trim().length > 0
      ? normalized.labelEvidence.trim()
      : "Product identified from shelf photo.";

  const storedIngredients = parseRawIngredients(normalized.ingredients);
  const apiIngredients = storedIngredients.map((i) => ({
    name: i.name,
    mgAmount: i.mgAmount,
  }));

  return {
    productName,
    brand,
    confidence,
    labelEvidence,
    hasIngredientDetails: apiIngredients.length > 0,
    needsReview: confidence < SHELF_NEEDS_REVIEW_THRESHOLD,
    ingredients: apiIngredients,
  };
}

function enrichShelfProductWithLibraryMatch(product: ShelfDetectedProduct): ShelfDetectedProduct {
  const matched = matchShelfProductToLibrary({
    productName: product.productName,
    brand: product.brand,
    labelEvidence: product.labelEvidence,
    visionIngredients: product.ingredients,
  });

  const ingredients = matched.ingredients.map((ing) => ({
    name: ing.name,
    mgAmount: ing.mgAmount,
  }));

  return {
    ...product,
    productName: matched.productName,
    ingredients,
    hasIngredientDetails: matched.hasIngredientDetails,
    needsReview: product.needsReview || matched.needsReview,
  };
}

function shelfProductDedupKey(brand: string | null, productName: string): string {
  const combined = brand ? `${brand} ${productName}` : productName;
  return normalizeIngredientName(combined);
}

function areNearDuplicateKeys(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (longer.includes(shorter) && shorter.length / longer.length >= 0.8) {
    return true;
  }

  const tokensA = a.split(" ").filter(Boolean);
  const tokensB = b.split(" ").filter(Boolean);
  const tokenSetB = new Set(tokensB);
  const intersection = tokensA.filter((token) => tokenSetB.has(token)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 && intersection / union >= 0.85;
}

/** Collapse exact/near-exact AI duplicates, keeping the highest-confidence row. */
export function dedupeShelfProducts(products: ShelfDetectedProduct[]): ShelfDetectedProduct[] {
  const kept: ShelfDetectedProduct[] = [];

  for (const product of products) {
    const key = shelfProductDedupKey(product.brand, product.productName);
    const matchIndex = kept.findIndex((existing) =>
      areNearDuplicateKeys(key, shelfProductDedupKey(existing.brand, existing.productName)),
    );

    if (matchIndex === -1) {
      kept.push(product);
      continue;
    }

    if (product.confidence > kept[matchIndex].confidence) {
      kept[matchIndex] = product;
    }
  }

  return kept;
}

/**
 * Sends a shelf photo to a vision model and identifies up to 12 supplement
 * bottles. Does not write to the database — callers persist after user review.
 */
export async function scanShelfImage(
  imageBase64: string,
  mimeType: string,
  log: ShelfScanLog = logger,
): Promise<ShelfDetectedProduct[]> {
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
      max_completion_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You analyze photos of supplement/vitamin shelves or countertops with multiple bottles visible. " +
            `Identify up to ${SHELF_SCAN_MAX_PRODUCTS} distinct supplement products. ` +
            "Respond with strict JSON only, no markdown, in this exact shape: " +
            '{"products": [{"productName": string, "brand": string | null, "confidence": number, "labelEvidence": string, "ingredients": [{"name": string, "mgAmount": number}] | []}]}. ' +
            "productName: the supplement name (e.g. \"Vitamin D3\", \"Magnesium glycinate\") — not generic text like \"Supplement Facts\". " +
            "brand: manufacturer/brand if visible on the bottle, else null. " +
            "confidence: 0.0–1.0 how certain you are this product is correctly identified from visible label text. " +
            "labelEvidence: brief quote or description of what text on the bottle you used (e.g. \"Front label reads Nature Made Vitamin D3 2000 IU\"). " +
            "ingredients: only include when a Supplement Facts panel is legible for that bottle; otherwise use an empty array. " +
            "Convert amounts to milligrams (mg). If the photo has no supplement bottles, return {\"products\": []}.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Identify every distinct supplement bottle you can see in this shelf photo.",
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

  const rawProducts = Array.isArray(parsed.products)
    ? (parsed.products as unknown[]).map(normalizeRawShelfProduct)
    : [];
  const afterParse = rawProducts
    .map(parseShelfProduct)
    .filter((p): p is ShelfDetectedProduct => p !== null);
  const afterMatch = afterParse.map(enrichShelfProductWithLibraryMatch);
  const products = dedupeShelfProducts(afterMatch).slice(0, SHELF_SCAN_MAX_PRODUCTS);

  log.info(
    {
      openaiThrew: false,
      jsonParsed,
      rawProductCount: rawProducts.length,
      afterParseCount: afterParse.length,
      afterMatchCount: afterMatch.length,
      afterDedupCount: products.length,
      libraryMatchedCount: products.filter((p) => p.hasIngredientDetails).length,
      rawContentLength: content.length,
      matchSummary: products.map((p) => ({
        productName: p.productName,
        hasIngredientDetails: p.hasIngredientDetails,
        ingredientNames: p.ingredients.map((i) => i.name),
        needsReview: p.needsReview,
      })),
    },
    "[shelf-scan] detection pipeline",
  );

  return products;
}
