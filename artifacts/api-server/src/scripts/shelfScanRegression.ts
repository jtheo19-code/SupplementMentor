/**
 * Shelf scan regression: deterministic identity cases + user shelf photo fixture.
 * Run: pnpm --filter @workspace/api-server run test:shelf-regression
 *
 * Live OpenAI photo scan runs when AI_INTEGRATIONS_OPENAI_* env vars are set
 * and a local shelf photo is available (SHELF_SCAN_REGRESSION_IMAGE or debug/shelf-scan-rca/).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { dedupeShelfProducts } from "../lib/shelfScanDedupe";
import { matchShelfDetection } from "../lib/shelfProductMatch";
import { isGenericProductName } from "../lib/shelfGenericTerms";
import { resetVerifiedProductsCache } from "../lib/verifiedProductRegistry";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../../../..");
const PHOTO_FIXTURE_PATH = join(__dirname, "../../test-fixtures/shelf-photo-ocr-fixture.json");

function resolveLivePhotoImagePath(): string | null {
  const candidates = [
    process.env.SHELF_SCAN_REGRESSION_IMAGE,
    join(REPO_ROOT, "debug/shelf-scan-rca/02-processed-frontend-equivalent.jpg"),
    join(REPO_ROOT, "debug/shelf-scan-rca/01-original.jpg"),
  ].filter((path): path is string => Boolean(path));

  return candidates.find((path) => existsSync(path)) ?? null;
}

interface RegressionCase {
  name: string;
  rawOcrLines: string[];
  expectedProductId: string | null;
  expectedProductName: string;
  expectIngredients: boolean;
  expectVerifyIngredients?: boolean;
  expectNeedsReview?: boolean;
  forbiddenVerifiedProductIds?: string[];
}

interface PhotoFixtureBottle {
  rawOcrLines: string[];
  expectedProductId: string | null;
  expectedProductName: string;
  expectIngredients: boolean;
  expectVerifyIngredients?: boolean;
  expectNeedsReview?: boolean;
  forbiddenVerifiedProductIds?: string[];
}

interface PhotoFixture {
  bottles: PhotoFixtureBottle[];
  mustNotIncludeProductIds?: string[];
}

const CASES: RegressionCase[] = [
  {
    name: "Estro-Cort identity only",
    rawOcrLines: ["NuEthix", "ESTRO-CORT", "Dietary Supplement"],
    expectedProductId: "nuethix-estro-cort",
    expectedProductName: "Estro-Cort",
    expectIngredients: false,
    expectVerifyIngredients: true,
  },
  {
    name: "Cort-Eaze identity only (not in user shelf photo)",
    rawOcrLines: ["CORT-EAZE", "Stress Support"],
    expectedProductId: "cort-eaze",
    expectedProductName: "Cort-Eaze",
    expectIngredients: false,
    expectVerifyIngredients: true,
  },
  {
    name: "Quercetin with Bromelain verified",
    rawOcrLines: ["Nutricost", "QUERCETIN WITH BROMELAIN", "800 MG"],
    expectedProductId: "nutricost-quercetin-bromelain",
    expectedProductName: "Quercetin with Bromelain",
    expectIngredients: true,
  },
  {
    name: "Calcium D-Glucarate verified",
    rawOcrLines: ["NutriCology", "Calcium D-Glucarate 500 mg"],
    expectedProductId: "nutricology-calcium-d-glucarate",
    expectedProductName: "Calcium D-Glucarate",
    expectIngredients: true,
  },
  {
    name: "L-Theanine verified",
    rawOcrLines: ["PURE", "L-THEANINE EXTRA STRENGTH", "400 mg"],
    expectedProductId: "pure-l-theanine",
    expectedProductName: "L-Theanine",
    expectIngredients: true,
  },
  {
    name: "Solgar Vitamin C verified",
    rawOcrLines: ["Solgar", "VITAMIN C 1000 MG"],
    expectedProductId: "solgar-vitamin-c-1000",
    expectedProductName: "Vitamin C",
    expectIngredients: true,
  },
  {
    name: "Solgar Vitamin C misread OCR (10000 MCG)",
    rawOcrLines: ["Solgar", "VITAMIN 10000 MCG"],
    expectedProductId: null,
    expectedProductName: "Vitamin C",
    expectIngredients: false,
    expectNeedsReview: true,
    forbiddenVerifiedProductIds: ["solgar-vitamin-d3"],
  },
  {
    name: "Solgar Vitamin C misread as B12 10000 mcg (Replit failure)",
    rawOcrLines: ["Solgar", "Vitamin B12 10000 mcg"],
    expectedProductId: null,
    expectedProductName: "Vitamin B12 10000 mcg",
    expectIngredients: false,
    expectNeedsReview: true,
    forbiddenVerifiedProductIds: ["solgar-vitamin-c-1000", "solgar-vitamin-d3"],
  },
  {
    name: "Solgar Vitamin C photo misread as D3 10000 mcg (Replit)",
    rawOcrLines: ["Solgar", "VITAMIN D3", "10000 MCG"],
    expectedProductId: null,
    expectedProductName: "Vitamin D3",
    expectIngredients: false,
    expectNeedsReview: true,
    forbiddenVerifiedProductIds: ["solgar-vitamin-d3", "solgar-vitamin-c-1000"],
  },
  {
    name: "Solgar Vitamin D3 verified",
    rawOcrLines: ["Solgar", "VITAMIN D3", "2000 IU"],
    expectedProductId: "solgar-vitamin-d3",
    expectedProductName: "Vitamin D3",
    expectIngredients: true,
  },
  {
    name: "Tributyrin-X verified",
    rawOcrLines: ["Healthy Gut", "TRIBUTYRIN-X", "BUTYRATE BUILDER"],
    expectedProductId: "healthy-gut-tributyrin-x",
    expectedProductName: "Tributyrin-X Butyrate Builder",
    expectIngredients: true,
  },
  {
    name: "TravelBiotic BB536 verified",
    rawOcrLines: ["Natural Factors", "TravelBiotic", "BB536"],
    expectedProductId: "natural-factors-travelbiotic-bb536",
    expectedProductName: "TravelBiotic BB536",
    expectIngredients: true,
  },
  {
    name: "TUDCA verified",
    rawOcrLines: ["Double Wood", "TUDCA 500 mg"],
    expectedProductId: "double-wood-tudca",
    expectedProductName: "TUDCA",
    expectIngredients: true,
  },
];

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertDetection(
  label: string,
  result: ReturnType<typeof matchShelfDetection>,
  expected: {
    expectedProductId: string | null;
    expectedProductName: string;
    expectIngredients: boolean;
    expectVerifyIngredients?: boolean;
    expectNeedsReview?: boolean;
    forbiddenVerifiedProductIds?: string[];
  },
): void {
  assert(
    result.enrichment.verifiedProductId === expected.expectedProductId,
    `${label}: expected product id ${expected.expectedProductId}, got ${result.enrichment.verifiedProductId}`,
  );
  assert(
    result.productName === expected.expectedProductName,
    `${label}: expected name "${expected.expectedProductName}", got "${result.productName}"`,
  );
  assert(
    result.hasIngredientDetails === expected.expectIngredients,
    `${label}: expected hasIngredientDetails=${expected.expectIngredients}, got ${result.hasIngredientDetails}`,
  );
  if (expected.expectVerifyIngredients !== undefined) {
    assert(
      result.enrichment.verifyIngredientsAvailable === expected.expectVerifyIngredients,
      `${label}: expected verifyIngredientsAvailable=${expected.expectVerifyIngredients}, got ${result.enrichment.verifyIngredientsAvailable}`,
    );
  }
  if (expected.expectIngredients) {
    assert(result.ingredients.length > 0, `${label}: expected ingredients`);
    assert(
      result.enrichment.status === "verified" || result.enrichment.status === "provisional",
      `${label}: expected verified/provisional enrichment, got ${result.enrichment.status}`,
    );
  }
  if (expected.expectNeedsReview !== undefined) {
    assert(
      result.needsReview === expected.expectNeedsReview,
      `${label}: expected needsReview=${expected.expectNeedsReview}, got ${result.needsReview}`,
    );
  }
  for (const forbiddenId of expected.forbiddenVerifiedProductIds ?? []) {
    assert(
      result.enrichment.verifiedProductId !== forbiddenId,
      `${label}: must not verify as ${forbiddenId}`,
    );
  }
  if (result.needsReview) {
    assert(
      !result.hasIngredientDetails,
      `${label}: needsReview products must not have verified ingredient enrichment`,
    );
  }
}

function runIdentityRegression(): void {
  resetVerifiedProductsCache();
  let passed = 0;

  for (const testCase of CASES) {
    const result = matchShelfDetection({
      productName: "",
      brand: null,
      labelEvidence: "",
      rawOcrLines: testCase.rawOcrLines,
      visionIngredients: [],
      detectionConfidence: 0.9,
      ocrConfidence: 0.85,
    });

    assertDetection(testCase.name, result, testCase);
    passed += 1;
    console.log(`  ✓ ${testCase.name}`);
  }

  console.log(`Identity/enrichment: ${passed}/${CASES.length} passed`);
}

function runGenericTermGuard(): void {
  assert(isGenericProductName("VITAMIN 10000 MCG"), "generic vitamin dose line should be rejected");
  assert(isGenericProductName("Supplement Facts"), "supplement facts header should be rejected");

  const weakSolgar = matchShelfDetection({
    productName: "",
    brand: null,
    labelEvidence: "",
    rawOcrLines: ["Solgar", "VITAMIN 10000 MCG"],
    visionIngredients: [],
    detectionConfidence: 0.8,
    ocrConfidence: 0.8,
  });

  assert(weakSolgar.productName === "Vitamin C", "weak Solgar OCR should suggest Vitamin C tentatively");
  assert(weakSolgar.needsReview, "weak Solgar OCR must require review");
  assert(!weakSolgar.hasIngredientDetails, "weak Solgar OCR must not attach verified ingredients");

  const b12Misread = matchShelfDetection({
    productName: "",
    brand: null,
    labelEvidence: "",
    rawOcrLines: ["Solgar", "Vitamin B12 10000 mcg"],
    visionIngredients: [{ name: "Vitamin B12", mgAmount: 10000 }],
    detectionConfidence: 0.9,
    ocrConfidence: 0.85,
  });
  assert(b12Misread.needsReview, "B12 misread must require review");
  assert(!b12Misread.hasIngredientDetails, "B12 misread must never attach verified ingredients");
  assert(b12Misread.enrichment.verifiedProductId !== "solgar-vitamin-c-1000",
    "B12 misread must not verify as Vitamin C",
  );

  const d3Misread = matchShelfDetection({
    productName: "",
    brand: null,
    labelEvidence: "",
    rawOcrLines: ["Solgar", "VITAMIN D3", "10000 MCG"],
    visionIngredients: [],
    detectionConfidence: 0.9,
    ocrConfidence: 0.85,
  });
  assert(d3Misread.needsReview, "D3 + 10000 mcg misread must require review");
  assert(!d3Misread.hasIngredientDetails, "D3 + 10000 mcg misread must not attach verified ingredients");
  assert(
    d3Misread.enrichment.verifiedProductId !== "solgar-vitamin-d3",
    "D3 + 10000 mcg misread must not verify as Vitamin D3",
  );

  console.log("  ✓ generic term guard + weak vitamin OCR gating");
}

function runDedupeRegression(): void {
  const makeProduct = (brand: string | null, productName: string, confidence: number) => ({
    productName,
    brand,
    confidence,
  });

  const deduped = dedupeShelfProducts([
    makeProduct("Solgar", "Vitamin D3", 0.7),
    makeProduct("Solgar", "Vitamin D3", 0.9),
    makeProduct("Double Wood", "TUDCA", 0.85),
  ]);

  assert(deduped.length === 2, `dedupe expected 2 products, got ${deduped.length}`);
  const d3 = deduped.find((p) => p.productName === "Vitamin D3");
  assert(d3 !== undefined && d3.confidence === 0.9, "dedupe should keep higher-confidence duplicate");
  console.log("  ✓ dedupe near-duplicates");
}

function findFixtureProduct(
  products: ReturnType<typeof matchPhotoFixtureBottles>,
  expected: PhotoFixtureBottle,
) {
  if (expected.expectedProductId) {
    return products.find((p) => p.verifiedProductId === expected.expectedProductId);
  }
  return products.find((p) => p.productName === expected.expectedProductName);
}

function assertFixtureBottle(label: string, found: NonNullable<ReturnType<typeof findFixtureProduct>>, expected: PhotoFixtureBottle): void {
  assert(found.productName === expected.expectedProductName, `${label}: name mismatch`);
  assert(
    found.hasIngredientDetails === expected.expectIngredients,
    `${label}: ingredients mismatch`,
  );
  if (expected.expectVerifyIngredients !== undefined) {
    assert(
      found.verifyIngredientsAvailable === expected.expectVerifyIngredients,
      `${label}: verify flag mismatch`,
    );
  }
  if (expected.expectNeedsReview !== undefined) {
    assert(found.needsReview === expected.expectNeedsReview, `${label}: needsReview mismatch`);
  }
  for (const forbiddenId of expected.forbiddenVerifiedProductIds ?? []) {
    assert(found.verifiedProductId !== forbiddenId, `${label}: must not verify as ${forbiddenId}`);
  }
  if (found.needsReview) {
    assert(!found.hasIngredientDetails, `${label}: needsReview must not include verified ingredients`);
  }
}

function matchPhotoFixtureBottles(fixture: PhotoFixture) {
  return dedupeShelfProducts(
    fixture.bottles.map((bottle) => {
      const matched = matchShelfDetection({
        productName: "",
        brand: null,
        labelEvidence: "",
        rawOcrLines: bottle.rawOcrLines,
        visionIngredients: [],
        detectionConfidence: 0.9,
        ocrConfidence: 0.85,
      });
      return {
        productName: matched.productName,
        brand: matched.brand,
        confidence: matched.confidence,
        verifiedProductId: matched.enrichment.verifiedProductId,
        hasIngredientDetails: matched.hasIngredientDetails,
        verifyIngredientsAvailable: matched.enrichment.verifyIngredientsAvailable,
        needsReview: matched.needsReview,
        rawOcrLines: matched.rawOcrLines,
      };
    }),
  );
}

function runPhotoFixtureRegression(): void {
  resetVerifiedProductsCache();
  assert(existsSync(PHOTO_FIXTURE_PATH), `missing photo fixture: ${PHOTO_FIXTURE_PATH}`);

  const fixture = JSON.parse(readFileSync(PHOTO_FIXTURE_PATH, "utf8")) as PhotoFixture;
  const products = matchPhotoFixtureBottles(fixture);

  assert(
    products.length === fixture.bottles.length,
    `photo fixture expected ${fixture.bottles.length} products, got ${products.length}`,
  );

  for (const expected of fixture.bottles) {
    const found = findFixtureProduct(products, expected);
    if (!found) {
      throw new Error(
        `photo fixture missing expected product ${expected.expectedProductName} (${expected.expectedProductId ?? "no id"})`,
      );
    }
    assertFixtureBottle(`photo:${expected.expectedProductName}`, found, expected);
    console.log(`  ✓ photo fixture: ${expected.expectedProductName}`);
  }

  for (const bannedId of fixture.mustNotIncludeProductIds ?? []) {
    assert(
      !products.some((p) => p.verifiedProductId === bannedId),
      `photo fixture must not include ${bannedId}`,
    );
  }
  console.log("  ✓ Cort-Eaze correctly absent from user shelf photo");
  console.log(`Photo fixture regression: ${fixture.bottles.length}/${fixture.bottles.length} passed`);
}

async function runLivePhotoRegression(): Promise<void> {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    console.log("Live photo scan skipped (OpenAI env not set)");
    return;
  }

  const imagePath = resolveLivePhotoImagePath();
  if (!imagePath) {
    console.log("Live photo scan skipped (no local shelf photo found)");
    return;
  }

  const fixture = JSON.parse(readFileSync(PHOTO_FIXTURE_PATH, "utf8")) as PhotoFixture;
  const imageBase64 = readFileSync(imagePath).toString("base64");

  const { scanShelfImage } = await import("../lib/shelfScan");
  const { clearShelfScanCache } = await import("../lib/shelfScanCache");
  clearShelfScanCache();

  const products = await scanShelfImage(imageBase64, "image/jpeg", console);

  assert(
    products.length === fixture.bottles.length,
    `live photo expected ${fixture.bottles.length} products, got ${products.length} (${products.map((p) => p.productName).join(", ")})`,
  );

  for (const expected of fixture.bottles) {
    const found =
      expected.expectedProductId !== null
        ? products.find((p) => p.enrichment.verifiedProductId === expected.expectedProductId)
        : products.find((p) => p.productName === expected.expectedProductName);
    if (!found) {
      throw new Error(
        `live photo missing ${expected.expectedProductName} (${expected.expectedProductId ?? "no id"}); got: ${products.map((p) => `${p.productName}:${p.enrichment.verifiedProductId}`).join(", ")}`,
      );
    }
    assertDetection(`live photo:${expected.expectedProductName}`, found, expected);
    console.log(`  ✓ live photo: ${expected.expectedProductName}`);
  }

  for (const bannedId of fixture.mustNotIncludeProductIds ?? []) {
    assert(
      !products.some((p) => p.enrichment.verifiedProductId === bannedId),
      `live photo must not include ${bannedId}`,
    );
  }

  console.log(`Live photo regression: ${fixture.bottles.length}/${fixture.bottles.length} passed`);
}

async function main(): Promise<void> {
  console.log("Shelf scan regression\n");
  runIdentityRegression();
  runGenericTermGuard();
  runDedupeRegression();
  console.log("");
  runPhotoFixtureRegression();
  console.log("");
  await runLivePhotoRegression();
  console.log("\nAll shelf scan regression checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
