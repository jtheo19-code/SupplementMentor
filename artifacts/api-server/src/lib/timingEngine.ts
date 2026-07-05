import type { StoredIngredient } from "@workspace/db";
import type { SeedProduct } from "./seedProducts";
import { detectContraindications, type Contraindication } from "./contraindications";

export interface MedicationInput {
  name: string;
  time: string;
}

export interface AnchorsInput {
  wake: string;
  breakfast: string;
  dinner: string;
  bed: string;
  medications?: MedicationInput[] | null;
  coffeeTime?: string | null;
}

export interface TimingPill {
  label: string;
  isAnchor: boolean;
  reason: string | null;
  source: string | null;
}

export interface TimingSlot {
  time: string;
  context: string;
  note: string | null;
  pills: TimingPill[];
}

export interface AuditItem {
  ingredientName: string;
  totalMg: number;
  products: string[];
}

export interface TimingMapResult {
  slots: TimingSlot[];
  audit: AuditItem[];
  contraindications: Contraindication[];
}

const CITATIONS: Record<string, string> = {
  "Omega-3 (EPA/DHA)": "Source: Schram et al., fat co-ingestion and omega-3 bioavailability",
  "Vitamin D3": "Source: Borel et al., 2015 — fat-soluble vitamin absorption",
  "Vitamin K2": "Source: Borel et al., 2015 — fat-soluble vitamin absorption",
  "Iron bisglycinate": "Source: NIH ODS iron fact sheet",
  "Vitamin C": "Source: NIH ODS iron fact sheet — ascorbic acid boosts non-heme iron uptake",
  "Zinc picolinate": "Source: DMT1 competition literature — divalent mineral transport",
  "Magnesium glycinate": "Source: DMT1 competition literature — divalent mineral transport",
  "Calcium citrate": "Source: DMT1 competition literature — divalent mineral transport",
  "Multi-strain probiotic": "Source: general probiotic dosing guidance — empty stomach transit",
};

// Mechanism-level citations. Every placement gets a source: if the specific
// ingredient has a more precise citation above we use that, otherwise we fall
// back to the citation for the mechanism that drove the placement — so no
// recommendation is ever shown without a reference behind it.
const MECH = {
  fatSoluble: "Source: Borel et al., 2015 — dietary fat and fat-soluble vitamin absorption",
  mineralCompetition:
    "Source: Divalent metal transporter (DMT1) competition among iron, zinc, calcium and magnesium",
  medicationSpacing:
    "Source: NIH Office of Dietary Supplements — separate polyvalent minerals from medications by several hours",
  emptyStomach:
    "Source: Fasted-state pharmacokinetics — reduced nutrient competition on an empty stomach",
  evening: "Source: Circadian and sleep-onset dosing guidance",
  withMeal:
    "Source: General supplement tolerability guidance — food improves comfort and steady uptake",
  pairing: "Source: Nutrient synergy literature — co-ingestion enhances uptake",
} as const;

function sourceFor(instance: IngredientInstance, fallback: string): string {
  return CITATIONS[instance.name] ?? fallback;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function circularDistanceMinutes(a: number, b: number): number {
  const diff = Math.abs(a - b) % 1440;
  return Math.min(diff, 1440 - diff);
}

function minutesToTime(mins: number): string {
  const normalized = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface IngredientInstance extends StoredIngredient {
  productName: string;
}

type SlotKey = "wake" | "breakfast" | "lunch" | "dinner" | "windDown";

interface SlotPlan {
  key: SlotKey;
  time: number;
  context: string;
}

export function generateTimingMap(
  products: SeedProduct[],
  anchors: AnchorsInput,
): TimingMapResult {
  const wake = timeToMinutes(anchors.wake);
  const breakfast = timeToMinutes(anchors.breakfast);
  const dinner = timeToMinutes(anchors.dinner);
  const bed = timeToMinutes(anchors.bed);
  const allMedicationNames = (anchors.medications ?? [])
    .map((m) => m.name.trim())
    .filter((name) => name.length > 0);
  const medications = (anchors.medications ?? [])
    .map((m) => ({ name: m.name.trim(), time: m.time }))
    .filter((m) => m.name && m.time)
    .map((m) => ({ name: m.name, minutes: timeToMinutes(m.time) }));
  const hasMedications = medications.length > 0;
  const medicationNames = medications.map((m) => m.name).join(", ");
  const coffeeTime =
    anchors.coffeeTime != null && anchors.coffeeTime.trim() !== ""
      ? timeToMinutes(anchors.coffeeTime)
      : null;

  const lunch = Math.round((breakfast + dinner) / 2 / 30) * 30;
  const windDown = bed - 60;

  const slotPlans: Record<SlotKey, SlotPlan> = {
    wake: { key: "wake", time: wake, context: "empty stomach" },
    breakfast: { key: "breakfast", time: breakfast, context: "with breakfast" },
    lunch: { key: "lunch", time: lunch, context: "with lunch" },
    dinner: { key: "dinner", time: dinner, context: "with dinner" },
    windDown: { key: "windDown", time: windDown, context: "wind-down" },
  };

  const instances: IngredientInstance[] = [];
  for (const product of products) {
    for (const ing of product.ingredients) {
      instances.push({ ...ing, productName: product.name });
    }
  }

  const assignments = new Map<
    SlotKey,
    { instance: IngredientInstance; reason: string | null; source: string | null }[]
  >();
  const mineralSlotByClass = new Map<string, SlotKey>();

  const mealCandidates: SlotKey[] = ["breakfast", "lunch", "dinner"];

  function assign(
    slot: SlotKey,
    instance: IngredientInstance,
    reason: string | null,
    source: string | null = null,
  ) {
    if (!assignments.has(slot)) assignments.set(slot, []);
    assignments.get(slot)!.push({ instance, reason, source });
  }

  for (const instance of instances) {
    // Mineral with medication-gap requirement
    if (instance.mineralClass && instance.avoidNearMedicationHours && hasMedications) {
      const gap = instance.avoidNearMedicationHours * 60;
      let chosen: SlotKey | null = null;
      for (const cand of mealCandidates) {
        const t = slotPlans[cand].time;
        const clearOfMeds = medications.every(
          (med) => circularDistanceMinutes(t, med.minutes) >= gap,
        );
        const clearOfCoffee =
          coffeeTime == null || Math.abs(t - coffeeTime) >= 60 || instance.mineralClass !== "iron";
        const clearOfOtherMinerals = !mineralSlotByClass.has(instance.mineralClass) ||
          [...mineralSlotByClass.entries()].every(
            ([cls, s]) => cls === instance.mineralClass || s !== cand,
          );
        if (clearOfMeds && clearOfCoffee && clearOfOtherMinerals) {
          chosen = cand;
          break;
        }
      }
      if (!chosen) chosen = "dinner";
      mineralSlotByClass.set(instance.mineralClass, chosen);
      const hoursClear = instance.avoidNearMedicationHours;
      const medLabel = medicationNames || "medication";
      const reason = `Kept ${hoursClear}+ hours from your ${medLabel} and away from other minerals. Minerals like this bind to certain medications in the gut — and to each other — forming clumps your body can't absorb, so both the drug and the mineral lose potency. Spacing them out protects both.`;
      assign(chosen, instance, reason, sourceFor(instance, MECH.medicationSpacing));
      continue;
    }

    // Non-medication-gated mineral: still avoid stacking two different mineral classes together
    if (instance.mineralClass) {
      let chosen: SlotKey = "lunch";
      for (const cand of mealCandidates) {
        const clear = [...mineralSlotByClass.entries()].every(
          ([cls, s]) => cls === instance.mineralClass || s !== cand,
        );
        if (clear) {
          chosen = cand;
          break;
        }
      }
      mineralSlotByClass.set(instance.mineralClass, chosen);
      assign(
        chosen,
        instance,
        "Spaced from the other minerals in your stack. Divalent minerals — iron, zinc, calcium, magnesium — share one intestinal transporter (DMT1), so taken together they compete and each is absorbed less. Separating them lets each one work.",
        sourceFor(instance, MECH.mineralCompetition),
      );
      continue;
    }

    if (instance.fatSoluble) {
      assign(
        "breakfast",
        instance,
        "Fat-soluble, so it dissolves in fat rather than water and needs dietary fat to cross into your bloodstream. Taken with a meal that contains fat, absorption can be several times higher than on an empty stomach.",
        sourceFor(instance, MECH.fatSoluble),
      );
      continue;
    }

    if (instance.timingWindow === "evening") {
      assign(
        "windDown",
        instance,
        "Placed in the evening because its calming, sleep-supporting action works with your body's natural wind-down. Taken earlier it can blunt daytime alertness or wear off before bedtime.",
        sourceFor(instance, MECH.evening),
      );
      continue;
    }

    if (instance.timingWindow === "empty_stomach") {
      assign(
        "wake",
        instance,
        "Taken on an empty stomach: with no food in the way it clears the gut and absorbs more completely. Amino acids in particular compete with dietary protein for the same transporters, so fasting lets more get through.",
        sourceFor(instance, MECH.emptyStomach),
      );
      continue;
    }

    if (instance.pairWith) {
      const pairedInStack = instances.some((i) => i.name === instance.pairWith);
      if (pairedInStack) {
        assign(
          "lunch",
          instance,
          `Timed alongside ${instance.pairWith} on purpose — together they do more than either alone, because this pairing actively increases how much your body absorbs.`,
          sourceFor(instance, MECH.pairing),
        );
        continue;
      }
    }

    if (instance.timingWindow === "with_meal") {
      assign(
        "lunch",
        instance,
        "Taken with food, which buffers the stomach and steadies absorption — you get more benefit with less chance of GI upset.",
        sourceFor(instance, MECH.withMeal),
      );
      continue;
    }

    assign(
      "lunch",
      instance,
      "Placed with a meal as a sensible default: it has no strict timing requirement, and food supports comfortable, steady absorption through the day.",
      sourceFor(instance, MECH.withMeal),
    );
  }

  const orderedKeys: SlotKey[] = (["wake", "breakfast", "lunch", "dinner", "windDown"] as SlotKey[])
    .filter((k) => assignments.has(k))
    .sort((a, b) => slotPlans[a].time - slotPlans[b].time);

  const slots: TimingSlot[] = [];
  const seenTimes = new Map<string, TimingSlot>();

  for (const key of orderedKeys) {
    const plan = slotPlans[key];
    const time = minutesToTime(plan.time);
    const entries = assignments.get(key)!;
    let slot = seenTimes.get(time);
    if (!slot) {
      slot = { time, context: plan.context, note: null, pills: [] };
      seenTimes.set(time, slot);
      slots.push(slot);
    }
    for (const entry of entries) {
      slot.pills.push({
        label: entry.instance.name,
        isAnchor: false,
        reason: entry.reason,
        source: entry.source,
      });
    }
  }

  for (const med of medications) {
    const medTimeStr = minutesToTime(med.minutes);
    let medSlot = seenTimes.get(medTimeStr);
    if (!medSlot) {
      medSlot = { time: medTimeStr, context: "your medication window", note: null, pills: [] };
      slots.push(medSlot);
      seenTimes.set(medTimeStr, medSlot);
    }
    medSlot.pills.push({
      label: `${med.name} (your anchor)`,
      isAnchor: true,
      reason:
        "Your fixed medication time. The rest of your stack is scheduled around it so nothing interferes with how this medication is absorbed or how it works.",
      source: null,
    });
  }

  if (coffeeTime != null) {
    const coffeeTimeStr = minutesToTime(coffeeTime);
    let coffeeSlot = seenTimes.get(coffeeTimeStr);
    if (!coffeeSlot) {
      coffeeSlot = { time: coffeeTimeStr, context: "your stimulant window", note: null, pills: [] };
      slots.push(coffeeSlot);
      seenTimes.set(coffeeTimeStr, coffeeSlot);
    }
    coffeeSlot.pills.push({
      label: "Coffee (your anchor)",
      isAnchor: true,
      reason:
        "Your coffee time. Caffeine-sensitive supplements and minerals that bind to coffee's polyphenols (like iron) are spaced away from it so neither gets blunted.",
      source: null,
    });
    slots.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  } else {
    slots.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  }

  // Stack audit — ingredients appearing in 2+ distinct products
  const totals = new Map<string, { totalMg: number; products: Set<string> }>();
  for (const product of products) {
    for (const ing of product.ingredients) {
      if (ing.mgAmount <= 0) continue;
      const entry = totals.get(ing.name) ?? { totalMg: 0, products: new Set<string>() };
      entry.totalMg += ing.mgAmount;
      entry.products.add(product.name);
      totals.set(ing.name, entry);
    }
  }

  const audit: AuditItem[] = [];
  for (const [ingredientName, entry] of totals.entries()) {
    if (entry.products.size >= 2) {
      audit.push({
        ingredientName,
        totalMg: entry.totalMg,
        products: [...entry.products],
      });
    }
  }

  const supplementNames = instances.map((i) => i.name);
  const contraindications = detectContraindications(
    supplementNames,
    allMedicationNames,
  );

  return { slots, audit, contraindications };
}
