import type { SeedProduct } from "./seedProducts";
import { INGREDIENT_LIBRARY } from "./ingredientLibrary";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Generates the product catalog: every library ingredient as a single
 * standalone product. Multi-ingredient blends are intentionally not generated
 * here — users add their own multi-ingredient products by scanning a label
 * photo, so a curated catalog of individual compounds is the source of truth.
 */
export function generateAllProducts(): SeedProduct[] {
  const POPULAR_STANDALONE = new Set([
    "Iron bisglycinate", "Zinc picolinate", "Vitamin D3", "Magnesium glycinate",
    "Omega-3 (EPA/DHA)", "Vitamin C", "Creatine monohydrate", "L-theanine", "Melatonin",
  ]);

  return INGREDIENT_LIBRARY.map((ing) => ({
    id: slugify(ing.name),
    name: ing.name,
    type: "standalone",
    badge: null,
    popular: POPULAR_STANDALONE.has(ing.name),
    ingredients: [ing],
  }));
}
