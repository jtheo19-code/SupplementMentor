import { openai } from "@workspace/integrations-openai-ai-server";
import { normalizeIngredientName, parseRawIngredients } from "./scanIngredients";

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

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function parseShelfProduct(raw: RawShelfProduct): ShelfDetectedProduct | null {
  const productName = typeof raw.productName === "string" ? raw.productName.trim() : "";
  if (!productName) return null;

  const brand =
    typeof raw.brand === "string" && raw.brand.trim().length > 0 ? raw.brand.trim() : null;
  const confidence = clampConfidence(raw.confidence);
  const labelEvidence =
    typeof raw.labelEvidence === "string" && raw.labelEvidence.trim().length > 0
      ? raw.labelEvidence.trim()
      : "Product identified from shelf photo.";

  const storedIngredients = parseRawIngredients(raw.ingredients);
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
): Promise<ShelfDetectedProduct[]> {
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

  const content = response.choices[0]?.message?.content ?? "{}";
  let parsed: RawShelfExtraction;
  try {
    parsed = JSON.parse(content) as RawShelfExtraction;
  } catch {
    parsed = {};
  }

  const rawProducts = Array.isArray(parsed.products) ? (parsed.products as RawShelfProduct[]) : [];
  const products = dedupeShelfProducts(
    rawProducts
      .map(parseShelfProduct)
      .filter((p): p is ShelfDetectedProduct => p !== null)
      .slice(0, SHELF_SCAN_MAX_PRODUCTS),
  );

  return products;
}
