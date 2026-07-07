/**
 * Rejects generic label/header tokens that must not become product names.
 */
const GENERIC_PRODUCT_NAMES = new Set([
  "supplement",
  "supplements",
  "dietary supplement",
  "dietary supplements",
  "vitamin",
  "vitamins",
  "supplement facts",
  "nutrition facts",
  "drug facts",
  "other ingredients",
  "serving size",
  "servings per container",
  "amount per serving",
  "daily value",
  "percent daily value",
  "% daily value",
]);

const GENERIC_LINE_PATTERNS = [
  /^vitamin\s+\d+\s*(mcg|mg|iu)?$/i,
  /^\d+\s*(mg|mcg|iu|g)\s*$/i,
  /^supplement\s*facts?$/i,
];

export function isGenericProductName(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalized || normalized.length < 2) return true;
  if (GENERIC_PRODUCT_NAMES.has(normalized)) return true;
  return GENERIC_LINE_PATTERNS.some((pattern) => pattern.test(name.trim()));
}

export function pickBestOcrProductLine(rawOcrLines: string[]): string {
  const candidates = rawOcrLines
    .map((line) => line.trim())
    .filter((line) => line.length > 2 && !isGenericProductName(line));

  if (candidates.length === 0) return "";

  return candidates.sort((a, b) => b.length - a.length)[0] ?? "";
}
