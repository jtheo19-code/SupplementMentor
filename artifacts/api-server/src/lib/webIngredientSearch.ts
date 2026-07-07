import type { StoredIngredient } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { parseRawIngredients } from "./scanIngredients";
import {
  extractionCacheKey,
  getCachedExtraction,
  getCachedPageText,
  pageTextCacheKey,
  setCachedExtraction,
  setCachedPageText,
} from "./webIngredientSearchCache";
import {
  hostnameFromUrl,
  isFetchUrlApproved,
  isHostnameAllowed,
  resolveVerifiedProductFetchAllowlist,
} from "./verifiedProductUrlAllowlist";

export type WebIngredientSource = "manufacturer" | "retailer_discovery" | "none";

export interface WebIngredientSearchResult {
  source: WebIngredientSource;
  sourceUrl: string | null;
  sourceLabel: string;
  ingredients: StoredIngredient[];
  message: string;
  requiresConfirmation: true;
}

interface PageCandidate {
  url: string;
  text: string;
  kind: WebIngredientSource;
}

const MAX_REDIRECTS = 5;

async function fetchPageText(
  url: string,
  allowlist: NonNullable<ReturnType<typeof resolveVerifiedProductFetchAllowlist>>,
): Promise<string | null> {
  if (!isFetchUrlApproved(url, allowlist)) return null;

  const cacheKey = pageTextCacheKey(allowlist.verifiedProductId, url);
  const cached = getCachedPageText(cacheKey);
  if (cached) return cached;

  let currentUrl = url;

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      if (!isFetchUrlApproved(currentUrl, allowlist)) return null;

      const response = await fetch(currentUrl, {
        signal: AbortSignal.timeout(8000),
        redirect: "manual",
        headers: {
          "User-Agent": "SupplementMentor/1.0 (+https://supplementmentor.com)",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;
        const nextUrl = new URL(location, currentUrl).href;
        const nextHost = hostnameFromUrl(nextUrl);
        if (!nextHost || !isHostnameAllowed(nextHost, allowlist.allowedHostnames)) {
          return null;
        }
        currentUrl = nextUrl;
        continue;
      }

      if (!response.ok) return null;

      const html = await response.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 16000);

      if (text) {
        setCachedPageText(cacheKey, text);
      }
      return text || null;
    }
  } catch {
    return null;
  }

  return null;
}

async function extractIngredientsFromPageText(
  pageText: string,
  input: { brand: string | null; productName: string },
  cacheKey: string,
): Promise<StoredIngredient[]> {
  const cached = getCachedExtraction(cacheKey);
  if (cached) return cached;

  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    temperature: 0,
    max_completion_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You extract supplement facts ingredients from manufacturer page text. " +
          'Respond with strict JSON only: {"ingredients": [{"name": string, "mgAmount": number}]}. ' +
          "Only include ingredients explicitly listed for the requested product. " +
          "Convert amounts to milligrams when possible. " +
          "If the page does not contain a supplement facts list for this product, return an empty ingredients array. " +
          "Never invent ingredients.",
      },
      {
        role: "user",
        content: `Product: ${[input.brand, input.productName].filter(Boolean).join(" ")}\n\nPage text:\n${pageText}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  let ingredients: StoredIngredient[] = [];
  try {
    const parsed = JSON.parse(content) as { ingredients?: unknown };
    ingredients = parseRawIngredients(Array.isArray(parsed.ingredients) ? parsed.ingredients : []);
  } catch {
    ingredients = [];
  }

  setCachedExtraction(cacheKey, ingredients);
  return ingredients;
}

function buildAmazonDiscoveryUrl(brand: string | null, productName: string): string {
  const query = encodeURIComponent([brand, productName].filter(Boolean).join(" "));
  return `https://www.amazon.com/s?k=${query}`;
}

export async function searchWebIngredients(input: {
  brand: string | null;
  productName: string;
  verifiedProductId?: string | null;
}): Promise<WebIngredientSearchResult> {
  const candidates: PageCandidate[] = [];
  const allowlist = input.verifiedProductId
    ? resolveVerifiedProductFetchAllowlist(input.verifiedProductId)
    : null;

  const manufacturerUrls = allowlist?.urls ?? [];

  for (const url of manufacturerUrls) {
    if (!allowlist) continue;
    const text = await fetchPageText(url, allowlist);
    if (text) {
      candidates.push({ url, text, kind: "manufacturer" });
    }
  }

  for (const candidate of candidates) {
    if (!allowlist) continue;
    const cacheKey = extractionCacheKey(
      allowlist.verifiedProductId,
      candidate.url,
      input.brand,
      input.productName,
    );
    const ingredients = await extractIngredientsFromPageText(candidate.text, input, cacheKey);
    if (ingredients.length > 0) {
      return {
        source: candidate.kind,
        sourceUrl: candidate.url,
        sourceLabel: "Official manufacturer site",
        ingredients,
        message:
          "These ingredients were extracted from a web source and are not automatically trusted. Review and confirm before using them.",
        requiresConfirmation: true,
      };
    }
  }

  const amazonUrl = buildAmazonDiscoveryUrl(input.brand, input.productName);
  return {
    source: "none",
    sourceUrl: amazonUrl,
    sourceLabel: "No trusted supplement facts found",
    ingredients: [],
    message:
      manufacturerUrls.length > 0
        ? "Could not find a supplement facts list on the manufacturer site. Try scanning the Supplement Facts panel, or use Amazon only as a discovery hint — retailer listings are never auto-trusted."
        : "No manufacturer URL is on file for this product. Scan the Supplement Facts panel for reliable ingredient data.",
    requiresConfirmation: true,
  };
}
