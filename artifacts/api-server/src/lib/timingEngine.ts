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

  const assignments = new Map<SlotKey, { instance: IngredientInstance; reason: string | null }[]>();
  const mineralSlotByClass = new Map<string, SlotKey>();

  const mealCandidates: SlotKey[] = ["breakfast", "lunch", "dinner"];

  function assign(slot: SlotKey, instance: IngredientInstance, reason: string | null) {
    if (!assignments.has(slot)) assignments.set(slot, []);
    assignments.get(slot)!.push({ instance, reason });
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
      const reason = `${hoursClear}+ hours clear of your ${medLabel}; spaced from other minerals in your stack.`;
      assign(chosen, instance, reason);
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
        "Spaced from other minerals in your stack — divalent minerals compete for the same transporters at higher doses.",
      );
      continue;
    }

    if (instance.fatSoluble) {
      assign(
        "breakfast",
        instance,
        "Fat-soluble — dietary fat in the meal drives absorption several-fold.",
      );
      continue;
    }

    if (instance.timingWindow === "evening") {
      assign(
        "windDown",
        instance,
        "Formulated for evening use — supports the wind-down window ahead of sleep.",
      );
      continue;
    }

    if (instance.timingWindow === "empty_stomach") {
      assign("wake", instance, "Taken on an empty stomach for cleaner transit and absorption.");
      continue;
    }

    if (instance.pairWith) {
      const pairedInStack = instances.some((i) => i.name === instance.pairWith);
      if (pairedInStack) {
        assign(
          "lunch",
          instance,
          `Paired deliberately with ${instance.pairWith} — boosts its absorption.`,
        );
        continue;
      }
    }

    if (instance.timingWindow === "with_meal") {
      assign("lunch", instance, "Taken with food for better tolerance and absorption.");
      continue;
    }

    assign("lunch", instance, null);
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
        source: entry.reason ? CITATIONS[entry.instance.name] ?? null : null,
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
      reason: null,
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
      reason: null,
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
