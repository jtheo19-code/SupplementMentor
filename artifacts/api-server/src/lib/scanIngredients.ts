import type { StoredIngredient } from "@workspace/db";
import { INGREDIENT_BY_NAME } from "./ingredientLibrary";

export interface RawExtractedIngredient {
  name?: unknown;
  mgAmount?: unknown;
}

export function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findLibraryMatch(name: string): StoredIngredient | undefined {
  const normalized = normalizeIngredientName(name);
  for (const [libName, ing] of INGREDIENT_BY_NAME.entries()) {
    const libNormalized = normalizeIngredientName(libName);
    if (
      libNormalized === normalized ||
      libNormalized.includes(normalized) ||
      normalized.includes(libNormalized)
    ) {
      return ing;
    }
  }
  return undefined;
}

export function toStoredIngredient(raw: RawExtractedIngredient): StoredIngredient | null {
  if (typeof raw.name !== "string" || raw.name.trim().length === 0) return null;
  const name = raw.name.trim();
  const mgAmount =
    typeof raw.mgAmount === "number" && Number.isFinite(raw.mgAmount) ? raw.mgAmount : 0;

  const match = findLibraryMatch(name);
  if (match) {
    return { ...match, name, mgAmount: mgAmount > 0 ? mgAmount : match.mgAmount };
  }

  return { name, mgAmount, timingWindow: "with_meal" };
}

export function parseRawIngredients(raw: unknown): StoredIngredient[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => toStoredIngredient(item as RawExtractedIngredient))
    .filter((i): i is StoredIngredient => i !== null);
}
