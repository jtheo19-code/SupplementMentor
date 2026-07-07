/**
 * Deterministic shelf-scan regression (no OpenAI).
 * Run: pnpm --filter @workspace/api-server run test:shelf-regression
 */
import { dedupeShelfProducts } from "../lib/shelfScanDedupe";
import { matchShelfDetection } from "../lib/shelfProductMatch";
import { isGenericProductName } from "../lib/shelfGenericTerms";
import { resetVerifiedProductsCache } from "../lib/verifiedProductRegistry";

interface RegressionCase {
  name: string;
  rawOcrLines: string[];
  expectedProductId: string | null;
  expectedProductName: string;
  expectIngredients: boolean;
  expectVerifyIngredients?: boolean;
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
    name: "Cort-Eaze identity only",
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

    assert(
      result.enrichment.verifiedProductId === testCase.expectedProductId,
      `${testCase.name}: expected product id ${testCase.expectedProductId}, got ${result.enrichment.verifiedProductId}`,
    );
    assert(
      result.productName === testCase.expectedProductName,
      `${testCase.name}: expected name "${testCase.expectedProductName}", got "${result.productName}"`,
    );
    assert(
      result.hasIngredientDetails === testCase.expectIngredients,
      `${testCase.name}: expected hasIngredientDetails=${testCase.expectIngredients}, got ${result.hasIngredientDetails}`,
    );

    if (testCase.expectVerifyIngredients !== undefined) {
      assert(
        result.enrichment.verifyIngredientsAvailable === testCase.expectVerifyIngredients,
        `${testCase.name}: expected verifyIngredientsAvailable=${testCase.expectVerifyIngredients}, got ${result.enrichment.verifyIngredientsAvailable}`,
      );
    }

    if (testCase.expectIngredients) {
      assert(result.ingredients.length > 0, `${testCase.name}: expected ingredients`);
      assert(
        result.enrichment.status === "verified" || result.enrichment.status === "provisional",
        `${testCase.name}: expected verified/provisional enrichment, got ${result.enrichment.status}`,
      );
    }

    passed += 1;
    console.log(`  ✓ ${testCase.name}`);
  }

  console.log(`Identity/enrichment: ${passed}/${CASES.length} passed`);
}

function runGenericTermGuard(): void {
  assert(isGenericProductName("VITAMIN 10000 MCG"), "generic vitamin dose line should be rejected");
  assert(isGenericProductName("Supplement Facts"), "supplement facts header should be rejected");

  const generic = matchShelfDetection({
    productName: "",
    brand: null,
    labelEvidence: "",
    rawOcrLines: ["Solgar", "VITAMIN 10000 MCG"],
    visionIngredients: [],
    detectionConfidence: 0.8,
    ocrConfidence: 0.8,
  });

  assert(
    generic.productName !== "VITAMIN 10000 MCG",
    `generic OCR line must not become product name, got "${generic.productName}"`,
  );
  console.log("  ✓ generic term guard");
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

function main(): void {
  console.log("Shelf scan regression (deterministic)\n");
  runIdentityRegression();
  runGenericTermGuard();
  runDedupeRegression();
  console.log("\nAll shelf scan regression checks passed.");
}

main();
