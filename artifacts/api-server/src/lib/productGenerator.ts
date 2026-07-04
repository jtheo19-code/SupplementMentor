import type { StoredIngredient } from "@workspace/db";
import { INGREDIENT_LIBRARY, INGREDIENT_BY_NAME } from "./ingredientLibrary";
import type { SeedProduct } from "./seedProducts";

// Deterministic PRNG (mulberry32) so the generated catalog is stable across
// runs/environments instead of re-randomizing on every seed.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260704);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function ingredientsByNames(names: string[]): StoredIngredient[] {
  return names
    .map((n) => INGREDIENT_BY_NAME.get(n))
    .filter((i): i is StoredIngredient => Boolean(i));
}

function jitterMg(base: number, seed: number): number {
  const factor = 0.85 + (seed % 30) / 100; // 0.85x - 1.14x
  const value = base * factor;
  return value < 1 ? Math.round(value * 1000) / 1000 : Math.round(value);
}

interface Archetype {
  label: string;
  pool: string[];
  minIngredients: number;
  maxIngredients: number;
}

const ARCHETYPES: Archetype[] = [
  {
    label: "Daily Multivitamin",
    pool: [
      "Vitamin A (retinyl palmitate)", "Vitamin B1 (thiamine)", "Vitamin B2 (riboflavin)",
      "Vitamin B3 (niacin)", "Vitamin B5 (pantothenic acid)", "Vitamin B6", "Vitamin B7 (biotin)",
      "Vitamin B9 (folate)", "Vitamin B12 (methylcobalamin)", "Vitamin C", "Vitamin D3",
      "Vitamin E (mixed tocopherols)", "Vitamin K2 (MK-7)", "Zinc picolinate", "Selenium (selenomethionine)",
      "Iodine (potassium iodide)", "Chromium picolinate", "Manganese", "Copper (glycinate)", "Molybdenum",
    ],
    minIngredients: 9, maxIngredients: 14,
  },
  {
    label: "Greens Superfood",
    pool: [
      "Spirulina", "Chlorella", "Inulin (prebiotic fiber)", "Multi-strain probiotic",
      "Digestive enzyme blend", "Vitamin C", "Beta glucan", "Vitamin B-complex", "Astaxanthin",
    ],
    minIngredients: 5, maxIngredients: 9,
  },
  {
    label: "Pre-Workout",
    pool: [
      "Caffeine anhydrous", "Beta-alanine", "L-citrulline malate", "Creatine monohydrate",
      "L-tyrosine", "Taurine", "L-arginine", "Betaine anhydrous (TMG)",
    ],
    minIngredients: 4, maxIngredients: 7,
  },
  {
    label: "Post-Workout Recovery",
    pool: [
      "Whey protein isolate", "BCAA 2:1:1", "L-glutamine", "Creatine monohydrate", "HMB",
      "Potassium citrate", "L-carnitine tartrate", "Taurine",
    ],
    minIngredients: 4, maxIngredients: 7,
  },
  {
    label: "Joint Support",
    pool: [
      "Glucosamine sulfate", "Chondroitin sulfate", "MSM (methylsulfonylmethane)",
      "Collagen peptides", "Hyaluronic acid", "Boswellia serrata extract", "Turmeric (curcumin)",
    ],
    minIngredients: 4, maxIngredients: 7,
  },
  {
    label: "Sleep Support",
    pool: [
      "Melatonin", "Magnesium glycinate", "L-theanine", "GABA", "5-HTP", "Valerian root",
      "Chamomile extract", "Passionflower extract", "Glycine", "Lemon balm extract",
    ],
    minIngredients: 4, maxIngredients: 8,
  },
  {
    label: "Nootropic Focus Stack",
    pool: [
      "Alpha-GPC", "Bacopa monnieri", "Lion's mane mushroom", "Ginkgo biloba", "Huperzine A",
      "CDP-choline (citicoline)", "L-tyrosine", "Rhodiola rosea", "PQQ",
    ],
    minIngredients: 4, maxIngredients: 8,
  },
  {
    label: "Adaptogen Stress Relief",
    pool: [
      "Ashwagandha (KSM-66)", "Rhodiola rosea", "Holy basil (tulsi)", "Relora",
      "Magnolia bark extract", "L-theanine", "Phosphatidylserine", "Maral root", "Schisandra berry",
    ],
    minIngredients: 4, maxIngredients: 8,
  },
  {
    label: "Prenatal Formula",
    pool: [
      "Vitamin B9 (folate)", "Iron bisglycinate", "Calcium citrate", "Vitamin D3",
      "Algae oil (vegan DHA)", "Choline bitartrate", "Iodine (potassium iodide)",
      "Vitamin B12 (methylcobalamin)", "Vitamin B6",
    ],
    minIngredients: 6, maxIngredients: 9,
  },
  {
    label: "Women's Hormone Balance",
    pool: [
      "DIM (diindolylmethane)", "Chasteberry (vitex)", "Evening primrose oil", "Iron bisglycinate",
      "Vitamin B6", "Magnesium glycinate", "Vitamin B9 (folate)",
    ],
    minIngredients: 4, maxIngredients: 7,
  },
  {
    label: "Men's Testosterone Support",
    pool: [
      "Tribulus terrestris", "Fenugreek seed extract", "Zinc picolinate", "DHEA",
      "Saw palmetto extract", "Ashwagandha (KSM-66)", "Boron",
    ],
    minIngredients: 4, maxIngredients: 7,
  },
  {
    label: "Immune Support",
    pool: [
      "Vitamin C", "Zinc gluconate", "Elderberry extract", "Echinacea purpurea", "Vitamin D3",
      "Beta glucan", "Selenium (selenomethionine)", "Garlic extract (allicin)",
    ],
    minIngredients: 4, maxIngredients: 8,
  },
  {
    label: "Gut Health Digestive",
    pool: [
      "Multi-strain probiotic", "Lactobacillus acidophilus", "Bifidobacterium lactis",
      "Digestive enzyme blend", "Betaine HCl", "Psyllium husk", "Inulin (prebiotic fiber)",
      "L-glutamine",
    ],
    minIngredients: 4, maxIngredients: 8,
  },
  {
    label: "Heart Health",
    pool: [
      "CoQ10 (ubiquinone)", "Ubiquinol", "Omega-3 (EPA/DHA)", "Garlic extract (allicin)",
      "Niacin (flush-free)", "Red yeast rice", "Resveratrol",
    ],
    minIngredients: 4, maxIngredients: 7,
  },
  {
    label: "Energy & Metabolism",
    pool: [
      "Green tea extract (EGCG)", "Caffeine anhydrous", "Guarana extract", "Yerba mate extract",
      "L-carnitine tartrate", "Vitamin B-complex", "Chromium picolinate", "Vitamin B12 (methylcobalamin)",
    ],
    minIngredients: 4, maxIngredients: 8,
  },
  {
    label: "Hair Skin & Nails",
    pool: [
      "Vitamin B7 (biotin)", "Collagen peptides", "Silica (bamboo extract)",
      "Vitamin E (mixed tocopherols)", "MSM (methylsulfonylmethane)", "Hyaluronic acid", "Vitamin C",
    ],
    minIngredients: 4, maxIngredients: 7,
  },
  {
    label: "Eye Health",
    pool: [
      "Lutein", "Zeaxanthin", "Bilberry extract", "Astaxanthin", "Vitamin A (retinyl palmitate)",
      "Omega-3 (EPA/DHA)", "Vitamin C",
    ],
    minIngredients: 4, maxIngredients: 7,
  },
  {
    label: "Antioxidant Longevity",
    pool: [
      "Resveratrol", "Quercetin", "NMN (nicotinamide mononucleotide)", "NR (nicotinamide riboside)",
      "Alpha lipoic acid", "CoQ10 (ubiquinone)", "Vitamin C", "Vitamin E (mixed tocopherols)", "PQQ",
    ],
    minIngredients: 4, maxIngredients: 8,
  },
  {
    label: "Blood Sugar Support",
    pool: [
      "Berberine", "Chromium picolinate", "Alpha lipoic acid", "Magnesium glycinate", "Vitamin B7 (biotin)",
    ],
    minIngredients: 3, maxIngredients: 5,
  },
  {
    label: "Liver Detox Support",
    pool: [
      "Milk thistle (silymarin)", "NAC (N-acetylcysteine)", "Turmeric (curcumin)",
      "Vitamin B-complex", "Alpha lipoic acid",
    ],
    minIngredients: 3, maxIngredients: 5,
  },
];

const BRAND_PREFIXES = [
  "VitaCore", "PeakForm", "TrueRoot", "NorthStar", "Evercrest", "PureAscend", "Ironvale",
  "Solstice", "Meridian", "Nutrivia", "Bluepeak", "Ridgeline", "Vitalis", "Amberwell",
  "Clearpath", "Summit", "Wildgrove", "Corevita", "Brightleaf", "Steadfast", "Highmark",
  "Foundry", "Cascadia", "Lumen", "Thornwell", "Basecamp", "Radiant", "Ironclad", "Verdant",
  "Anchorpoint", "Trueform", "Novavita", "Sagebrook", "Primalwell", "Everline", "Keystone",
  "Freshfield", "Ambervale", "Nordvita", "Clarion",
];

const QUALIFIERS = ["", "Advanced", "Ultra", "Pro", "Max", "Elite", "Complete", "Extra Strength", "Daily", "Essential"];

function buildBlend(
  archetype: Archetype,
  brand: string,
  qualifier: string,
  index: number,
): SeedProduct {
  const name = qualifier ? `${brand} ${qualifier} ${archetype.label}` : `${brand} ${archetype.label}`;
  const shuffled = shuffle(archetype.pool);
  const count = Math.min(
    shuffled.length,
    archetype.minIngredients + (index % (archetype.maxIngredients - archetype.minIngredients + 1)),
  );
  const names = shuffled.slice(0, count);
  const baseIngredients = ingredientsByNames(names);
  const ingredients = baseIngredients.map((ing, i) => ({
    ...ing,
    mgAmount: jitterMg(ing.mgAmount, index + i * 7),
  }));

  return {
    id: `${slugify(name)}-${index}`,
    name,
    type: "blend",
    badge: `blend · ${ingredients.length} ingredients`,
    popular: false,
    ingredients,
  };
}

/**
 * Generates the full product catalog: every library ingredient as a
 * standalone product, plus generated multi-ingredient blends across common
 * supplement archetypes, totalling roughly 1000 products.
 */
export function generateAllProducts(targetTotal = 1000): SeedProduct[] {
  const POPULAR_STANDALONE = new Set([
    "Iron bisglycinate", "Zinc picolinate", "Vitamin D3", "Magnesium glycinate",
    "Omega-3 (EPA/DHA)", "Vitamin C", "Creatine monohydrate", "L-theanine", "Melatonin",
  ]);

  const standaloneProducts: SeedProduct[] = INGREDIENT_LIBRARY.map((ing) => ({
    id: slugify(ing.name),
    name: ing.name,
    type: "standalone",
    badge: null,
    popular: POPULAR_STANDALONE.has(ing.name),
    ingredients: [ing],
  }));

  const blendTarget = Math.max(0, targetTotal - standaloneProducts.length);
  const perArchetype = Math.ceil(blendTarget / ARCHETYPES.length);

  const blendProducts: SeedProduct[] = [];
  const usedNames = new Set<string>();
  let globalIndex = 0;

  outer: for (const archetype of ARCHETYPES) {
    let madeForArchetype = 0;
    for (const qualifier of QUALIFIERS) {
      for (const brand of shuffle(BRAND_PREFIXES)) {
        if (madeForArchetype >= perArchetype || blendProducts.length >= blendTarget) continue;
        const product = buildBlend(archetype, brand, qualifier, globalIndex);
        if (usedNames.has(product.name)) continue;
        usedNames.add(product.name);
        blendProducts.push({ ...product, popular: blendProducts.length < 2 });
        madeForArchetype++;
        globalIndex++;
      }
      if (madeForArchetype >= perArchetype || blendProducts.length >= blendTarget) continue;
    }
    if (blendProducts.length >= blendTarget) break outer;
  }

  return [...standaloneProducts, ...blendProducts.slice(0, blendTarget)];
}
