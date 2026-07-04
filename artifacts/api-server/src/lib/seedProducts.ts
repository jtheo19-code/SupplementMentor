import type { StoredIngredient } from "@workspace/db";

export interface SeedProduct {
  id: string;
  name: string;
  type: "standalone" | "blend";
  badge: string | null;
  ingredients: StoredIngredient[];
  popular: boolean;
}

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    id: "iron-bisglycinate",
    name: "Iron bisglycinate",
    type: "standalone",
    badge: null,
    popular: true,
    ingredients: [
      {
        name: "Iron bisglycinate",
        mgAmount: 25,
        mineralClass: "iron",
        timingWindow: "with_meal",
        avoidNearMedicationHours: 4,
      },
    ],
  },
  {
    id: "zinc-picolinate",
    name: "Zinc picolinate",
    type: "standalone",
    badge: null,
    popular: true,
    ingredients: [
      {
        name: "Zinc picolinate",
        mgAmount: 15,
        mineralClass: "zinc",
        timingWindow: "with_meal",
        avoidNearMedicationHours: 2,
      },
    ],
  },
  {
    id: "vitamin-d3-k2",
    name: "Vitamin D3 + K2",
    type: "standalone",
    badge: null,
    popular: true,
    ingredients: [
      { name: "Vitamin D3", mgAmount: 0.125, fatSoluble: true, timingWindow: "with_meal" },
      { name: "Vitamin K2", mgAmount: 0.1, fatSoluble: true, timingWindow: "with_meal" },
    ],
  },
  {
    id: "magnesium-glycinate",
    name: "Magnesium glycinate",
    type: "standalone",
    badge: null,
    popular: true,
    ingredients: [
      {
        name: "Magnesium glycinate",
        mgAmount: 200,
        mineralClass: "magnesium",
        timingWindow: "evening",
      },
    ],
  },
  {
    id: "fish-oil",
    name: "Fish oil",
    type: "standalone",
    badge: null,
    popular: true,
    ingredients: [
      { name: "Omega-3 (EPA/DHA)", mgAmount: 1000, fatSoluble: true, timingWindow: "with_meal" },
    ],
  },
  {
    id: "vitamin-c",
    name: "Vitamin C",
    type: "standalone",
    badge: null,
    popular: true,
    ingredients: [
      {
        name: "Vitamin C",
        mgAmount: 500,
        timingWindow: "with_meal",
        pairWith: "Iron bisglycinate",
      },
    ],
  },
  {
    id: "calcium-citrate",
    name: "Calcium citrate",
    type: "standalone",
    badge: null,
    popular: false,
    ingredients: [
      {
        name: "Calcium citrate",
        mgAmount: 250,
        mineralClass: "calcium",
        timingWindow: "with_meal",
        avoidNearMedicationHours: 4,
      },
    ],
  },
  {
    id: "l-theanine",
    name: "L-theanine",
    type: "standalone",
    badge: null,
    popular: false,
    ingredients: [{ name: "L-theanine", mgAmount: 200, timingWindow: "flexible" }],
  },
  {
    id: "creatine-monohydrate",
    name: "Creatine monohydrate",
    type: "standalone",
    badge: null,
    popular: false,
    ingredients: [{ name: "Creatine monohydrate", mgAmount: 5000, timingWindow: "flexible" }],
  },
  {
    id: "cort-eaze",
    name: "Cort-Eaze",
    type: "blend",
    badge: "blend · 7 ingredients",
    popular: true,
    ingredients: [
      { name: "Ashwagandha", mgAmount: 150, timingWindow: "evening" },
      { name: "Rhodiola", mgAmount: 250, timingWindow: "evening" },
      { name: "Relora", mgAmount: 250, timingWindow: "evening" },
      { name: "Phosphatidylserine", mgAmount: 100, timingWindow: "evening" },
      { name: "L-theanine", mgAmount: 100, timingWindow: "evening" },
      { name: "NAC", mgAmount: 300, timingWindow: "evening" },
      { name: "Maral root", mgAmount: 300, timingWindow: "evening" },
    ],
  },
  {
    id: "adrena-calm",
    name: "Adrena-Calm",
    type: "blend",
    badge: "blend · 5 ingredients",
    popular: false,
    ingredients: [
      { name: "Ashwagandha", mgAmount: 300, timingWindow: "evening" },
      { name: "Magnolia bark", mgAmount: 200, timingWindow: "evening" },
      { name: "Holy basil", mgAmount: 150, timingWindow: "with_meal" },
      { name: "B6", mgAmount: 5, timingWindow: "with_meal" },
      { name: "GABA", mgAmount: 250, timingWindow: "evening" },
    ],
  },
  {
    id: "thyro-boost",
    name: "Thyro-Boost",
    type: "blend",
    badge: "blend · label pending",
    popular: false,
    ingredients: [],
  },
  {
    id: "probiotic-50b",
    name: "Probiotic 50B",
    type: "standalone",
    badge: null,
    popular: false,
    ingredients: [
      { name: "Multi-strain probiotic", mgAmount: 50, timingWindow: "empty_stomach" },
    ],
  },
  {
    id: "vitamin-b-complex",
    name: "Vitamin B-complex",
    type: "standalone",
    badge: null,
    popular: false,
    ingredients: [{ name: "Vitamin B-complex", mgAmount: 50, timingWindow: "with_meal" }],
  },
  {
    id: "melatonin",
    name: "Melatonin",
    type: "standalone",
    badge: null,
    popular: false,
    ingredients: [{ name: "Melatonin", mgAmount: 3, timingWindow: "evening" }],
  },
];
