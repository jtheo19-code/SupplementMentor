import type { StoredIngredient } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { INGREDIENT_BY_NAME } from "./ingredientLibrary";

export interface ScannedLabel {
  productName: string;
  ingredients: StoredIngredient[];
}

interface RawExtractedIngredient {
  name?: unknown;
  mgAmount?: unknown;
}

interface RawExtraction {
  productName?: unknown;
  ingredients?: unknown;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findLibraryMatch(name: string): StoredIngredient | undefined {
  const normalized = normalizeName(name);
  for (const [libName, ing] of INGREDIENT_BY_NAME.entries()) {
    const libNormalized = normalizeName(libName);
    if (libNormalized === normalized || libNormalized.includes(normalized) || normalized.includes(libNormalized)) {
      return ing;
    }
  }
  return undefined;
}

function toStoredIngredient(raw: RawExtractedIngredient): StoredIngredient | null {
  if (typeof raw.name !== "string" || raw.name.trim().length === 0) return null;
  const name = raw.name.trim();
  const mgAmount = typeof raw.mgAmount === "number" && Number.isFinite(raw.mgAmount) ? raw.mgAmount : 0;

  const match = findLibraryMatch(name);
  if (match) {
    return { ...match, name, mgAmount: mgAmount > 0 ? mgAmount : match.mgAmount };
  }

  return { name, mgAmount, timingWindow: "with_meal" };
}

/**
 * Sends a supplement label photo to a vision-capable model and extracts a
 * product name plus a structured ingredient list. Extracted ingredient names
 * are matched against the known ingredient library so they inherit correct
 * timing metadata (fat-soluble, mineral class, etc) whenever possible.
 */
export async function scanLabelImage(
  imageBase64: string,
  mimeType: string,
  productNameHint?: string | null,
): Promise<ScannedLabel> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You read photos of supplement/vitamin product labels (Supplement Facts panels) and extract a structured ingredient list. " +
          "Respond with strict JSON only, no markdown, in this exact shape: " +
          '{"productName": string, "ingredients": [{"name": string, "mgAmount": number}]}. ' +
          'For productName, use the brand/product name printed on the label (e.g. "Nature Made Vitamin D3"), never generic header text like "Supplement Facts" or "Nutrition Facts" — if no brand/product name is visible, omit productName entirely. ' +
          "Use the ingredient's common name (e.g. \"Vitamin D3\", \"Magnesium glycinate\", \"Omega-3 (EPA/DHA)\"). " +
          "Convert all amounts to milligrams (mg): micrograms (mcg/µg) divide by 1000, IU for Vitamin D3 ~ 0.025 mcg per IU, grams (g) multiply by 1000. " +
          "If an amount cannot be determined, use 0. If the photo is not a supplement label or no ingredients are legible, return an empty ingredients array.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: productNameHint
              ? `The product may be called "${productNameHint}". Extract its Supplement Facts panel.`
              : "Extract the Supplement Facts panel from this label photo.",
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
  let parsed: RawExtraction;
  try {
    parsed = JSON.parse(content) as RawExtraction;
  } catch {
    parsed = {};
  }

  const rawIngredients = Array.isArray(parsed.ingredients) ? (parsed.ingredients as RawExtractedIngredient[]) : [];
  const ingredients = rawIngredients
    .map(toStoredIngredient)
    .filter((i): i is StoredIngredient => i !== null);

  const GENERIC_HEADERS = new Set(["supplement facts", "nutrition facts", "drug facts", "other ingredients"]);
  const rawProductName = typeof parsed.productName === "string" ? parsed.productName.trim() : "";
  const productName =
    rawProductName.length > 0 && !GENERIC_HEADERS.has(normalizeName(rawProductName))
      ? rawProductName
      : (productNameHint?.trim() || "Scanned label");

  return { productName, ingredients };
}
