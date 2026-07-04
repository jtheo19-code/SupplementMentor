/**
 * Contraindication / interaction detection between a user's supplement stack
 * and their entered medications.
 *
 * This is intentionally conservative: it only encodes well-established,
 * clinically significant pharmacodynamic interactions (e.g. serotonin
 * syndrome). Absorption-timing interactions (minerals vs thyroid meds, etc.)
 * are handled separately by the timing engine's spacing logic and are NOT
 * duplicated here.
 *
 * Matching is done against free-text names (medications are typed by the user,
 * supplement names come from the catalog or scanned labels), so each entity
 * carries a list of aliases (brand + generic names) matched on word boundaries.
 */

export type Severity = "avoid" | "caution";

export interface Contraindication {
  severity: Severity;
  effect: string;
  substances: string[];
  mechanism: string;
  source: string | null;
}

interface InteractionEntity {
  id: string;
  label: string;
  kind: "supplement" | "medication";
  aliases: string[];
  tags: string[];
}

interface InteractionRule {
  id: string;
  /** Co-occurrence of an entity carrying tagA AND a distinct entity carrying tagB triggers the rule. */
  tagA: string;
  tagB: string;
  severity: Severity;
  effect: string;
  mechanism: string;
  source: string | null;
}

const ENTITIES: InteractionEntity[] = [
  // --- Serotonergic medications (SSRIs / SNRIs) ---
  {
    id: "ssri-snri",
    label: "SSRI/SNRI antidepressant",
    kind: "medication",
    tags: ["serotonergic"],
    aliases: [
      "escitalopram", "lexapro", "citalopram", "celexa", "sertraline", "zoloft",
      "fluoxetine", "prozac", "paroxetine", "paxil", "fluvoxamine", "luvox",
      "vortioxetine", "trintellix", "vilazodone", "viibryd",
      "venlafaxine", "effexor", "desvenlafaxine", "pristiq",
      "duloxetine", "cymbalta", "levomilnacipran", "fetzima", "milnacipran",
    ],
  },
  {
    id: "tricyclic",
    label: "tricyclic antidepressant",
    kind: "medication",
    tags: ["serotonergic"],
    aliases: [
      "amitriptyline", "elavil", "nortriptyline", "pamelor", "imipramine",
      "tofranil", "clomipramine", "anafranil", "doxepin",
    ],
  },
  {
    id: "triptan",
    label: "triptan migraine medication",
    kind: "medication",
    tags: ["serotonergic"],
    aliases: [
      "sumatriptan", "imitrex", "rizatriptan", "maxalt", "zolmitriptan",
      "zomig", "eletriptan", "relpax", "naratriptan", "frovatriptan", "almotriptan",
    ],
  },
  {
    id: "opioid-serotonergic",
    label: "serotonergic opioid",
    kind: "medication",
    tags: ["serotonergic"],
    aliases: ["tramadol", "ultram", "tapentadol", "nucynta", "meperidine", "demerol", "fentanyl"],
  },
  {
    id: "dxm",
    label: "dextromethorphan",
    kind: "medication",
    tags: ["serotonergic"],
    aliases: ["dextromethorphan", "robitussin", "delsym"],
  },
  {
    id: "buspirone-lithium",
    label: "serotonergic agent",
    kind: "medication",
    tags: ["serotonergic"],
    aliases: ["buspirone", "buspar", "lithium", "trazodone", "desyrel"],
  },
  // --- MAO inhibitors (severe serotonergic risk) ---
  {
    id: "maoi",
    label: "MAO inhibitor",
    kind: "medication",
    tags: ["mao_inhibitor"],
    aliases: [
      "phenelzine", "nardil", "tranylcypromine", "parnate", "isocarboxazid",
      "marplan", "selegiline", "emsam", "rasagiline", "azilect", "moclobemide",
      "linezolid", "zyvox",
    ],
  },
  // --- Serotonergic supplements ---
  {
    id: "5-htp",
    label: "5-HTP",
    kind: "supplement",
    tags: ["serotonergic"],
    aliases: ["5 htp", "5 hydroxytryptophan", "griffonia"],
  },
  {
    id: "l-tryptophan",
    label: "L-tryptophan",
    kind: "supplement",
    tags: ["serotonergic"],
    aliases: ["l tryptophan", "tryptophan"],
  },
  {
    id: "st-johns-wort",
    label: "St. John's wort",
    kind: "supplement",
    tags: ["serotonergic"],
    aliases: ["st john s wort", "st johns wort", "hypericum"],
  },
  {
    id: "sam-e",
    label: "SAM-e",
    kind: "supplement",
    tags: ["serotonergic"],
    aliases: ["sam e", "s adenosylmethionine", "ademetionine"],
  },
  {
    id: "saffron",
    label: "Saffron extract",
    kind: "supplement",
    tags: ["serotonergic"],
    aliases: ["saffron", "crocus sativus"],
  },
  {
    id: "kanna",
    label: "Kanna (Sceletium tortuosum)",
    kind: "supplement",
    tags: ["serotonergic"],
    aliases: ["kanna", "sceletium"],
  },
  {
    id: "methylene-blue",
    label: "Methylene blue",
    kind: "supplement",
    tags: ["mao_inhibitor"],
    aliases: ["methylene blue", "methylthioninium"],
  },
  {
    id: "syrian-rue",
    label: "Syrian rue (harmala)",
    kind: "supplement",
    tags: ["mao_inhibitor"],
    aliases: ["syrian rue", "harmala", "harmaline", "peganum"],
  },
  // --- Anticoagulants / Vitamin K ---
  {
    id: "vka-anticoagulant",
    label: "warfarin (vitamin K antagonist)",
    kind: "medication",
    tags: ["vka_anticoagulant"],
    aliases: ["warfarin", "coumadin", "jantoven", "acenocoumarol", "phenprocoumon"],
  },
  {
    id: "vitamin-k",
    label: "Vitamin K",
    kind: "supplement",
    tags: ["vitamin_k"],
    aliases: ["vitamin k", "vitamin k1", "vitamin k2", "phylloquinone", "menaquinone", "mk 7", "mk 4"],
  },
  // --- Hyperkalemia (potassium) ---
  {
    id: "potassium-raising-drug",
    label: "ACE inhibitor / ARB / potassium-sparing diuretic",
    kind: "medication",
    tags: ["potassium_raising"],
    aliases: [
      "lisinopril", "enalapril", "ramipril", "benazepril", "captopril",
      "perindopril", "quinapril", "fosinopril", "trandolapril",
      "losartan", "valsartan", "candesartan", "irbesartan", "olmesartan",
      "telmisartan", "azilsartan",
      "spironolactone", "aldactone", "eplerenone", "amiloride", "triamterene",
    ],
  },
  {
    id: "potassium-supp",
    label: "Potassium supplement",
    kind: "supplement",
    tags: ["potassium_supp"],
    aliases: [
      "potassium citrate", "potassium chloride", "potassium gluconate",
      "potassium bicarbonate", "potassium aspartate",
    ],
  },
  // --- Yohimbine / stimulant-pressor ---
  {
    id: "yohimbine",
    label: "Yohimbine",
    kind: "supplement",
    tags: ["pressor_supp"],
    aliases: ["yohimbine", "yohimbe", "rauwolscine", "alpha yohimbine"],
  },
];

const RULES: InteractionRule[] = [
  {
    id: "sero-maoi",
    tagA: "mao_inhibitor",
    tagB: "serotonergic",
    severity: "avoid",
    effect: "Serotonin syndrome (high risk)",
    mechanism:
      "Combining an MAO inhibitor with another serotonergic agent can cause a rapid, dangerous rise in serotonin. This is one of the most severe interactions in medicine and can be life-threatening.",
    source: "Source: Boyer & Shannon, NEJM 2005 — The Serotonin Syndrome",
  },
  {
    id: "sero-maoi-maoi",
    tagA: "mao_inhibitor",
    tagB: "mao_inhibitor",
    severity: "avoid",
    effect: "Serotonin syndrome (high risk)",
    mechanism:
      "Stacking two MAO-inhibiting agents compounds serotonergic and pressor effects and should be avoided.",
    source: "Source: Boyer & Shannon, NEJM 2005 — The Serotonin Syndrome",
  },
  {
    id: "sero-sero",
    tagA: "serotonergic",
    tagB: "serotonergic",
    severity: "caution",
    effect: "Serotonin syndrome risk",
    mechanism:
      "Two serotonergic agents together raise serotonin additively. Watch for agitation, tremor, sweating, rapid heartbeat, or confusion, and discuss the combination with your prescriber.",
    source: "Source: Boyer & Shannon, NEJM 2005 — The Serotonin Syndrome",
  },
  {
    id: "vitk-warfarin",
    tagA: "vitamin_k",
    tagB: "vka_anticoagulant",
    severity: "caution",
    effect: "Reduced anticoagulant effect",
    mechanism:
      "Vitamin K directly opposes warfarin, which can lower your INR and reduce protection against clots. Keep vitamin K intake steady and tell the clinic managing your INR before changing supplements.",
    source: "Source: NIH ODS Vitamin K fact sheet; Holbrook et al., 2005",
  },
  {
    id: "potassium-hyperk",
    tagA: "potassium_supp",
    tagB: "potassium_raising",
    severity: "avoid",
    effect: "Hyperkalemia (dangerously high potassium)",
    mechanism:
      "ACE inhibitors, ARBs, and potassium-sparing diuretics already raise potassium. Adding a potassium supplement can push levels dangerously high, affecting heart rhythm.",
    source: "Source: NIH ODS Potassium fact sheet",
  },
  {
    id: "yohimbine-pressor",
    tagA: "pressor_supp",
    tagB: "mao_inhibitor",
    severity: "avoid",
    effect: "Hypertensive crisis risk",
    mechanism:
      "Yohimbine raises blood pressure and adrenergic tone; combined with an MAO inhibitor this can trigger a dangerous spike in blood pressure.",
    source: "Source: Yohimbine prescribing and interaction data — hypertensive risk with MAOIs",
  },
];

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `.replace(/\s+/g, " ");
}

function matchesAlias(normalizedText: string, alias: string): boolean {
  return normalizedText.includes(` ${alias} `);
}

interface DetectedEntity {
  entity: InteractionEntity;
  /** The user-facing name that matched (their typed med name or the stack ingredient). */
  matchedName: string;
}

function detectEntities(names: string[]): DetectedEntity[] {
  const detected: DetectedEntity[] = [];
  const seen = new Set<string>();
  for (const rawName of names) {
    const norm = normalize(rawName);
    for (const entity of ENTITIES) {
      if (seen.has(entity.id)) continue;
      if (entity.aliases.some((a) => matchesAlias(norm, a))) {
        detected.push({ entity, matchedName: rawName });
        seen.add(entity.id);
      }
    }
  }
  return detected;
}

/**
 * Detect contraindications given the user's stack supplement names and their
 * medication names. Free-text names are matched against a curated alias list.
 */
export function detectContraindications(
  supplementNames: string[],
  medicationNames: string[],
): Contraindication[] {
  const detected = [
    ...detectEntities(supplementNames),
    ...detectEntities(medicationNames),
  ];
  if (detected.length < 2) return [];

  const results: Contraindication[] = [];
  const emitted = new Set<string>();

  for (const rule of RULES) {
    const withA = detected.filter((d) => d.entity.tags.includes(rule.tagA));
    const withB = detected.filter((d) => d.entity.tags.includes(rule.tagB));

    for (const a of withA) {
      for (const b of withB) {
        if (a.entity.id === b.entity.id) continue;
        // This is a supplement app: only surface interactions that involve at
        // least one supplement (supplement+medication, or two serotonergic
        // supplements stacked). Medication+medication combos are out of scope —
        // those are managed by the user's prescriber.
        if (a.entity.kind !== "supplement" && b.entity.kind !== "supplement") continue;
        // Canonical key so (a,b) and (b,a) collapse, and stronger rules win.
        const pairKey = [a.entity.id, b.entity.id].sort().join("|");
        const dedupeKey = `${rule.effect}::${pairKey}`;
        if (emitted.has(dedupeKey)) continue;
        emitted.add(dedupeKey);

        const substances = Array.from(new Set([a.matchedName, b.matchedName]));
        results.push({
          severity: rule.severity,
          effect: rule.effect,
          substances,
          mechanism: rule.mechanism,
          source: rule.source,
        });
      }
    }
  }

  // Collapse duplicate effect+substances pairs, keeping the most severe.
  const bySubstancePair = new Map<string, Contraindication>();
  for (const c of results) {
    const key = [...c.substances].sort().join("|");
    const existing = bySubstancePair.get(key);
    if (!existing || (existing.severity === "caution" && c.severity === "avoid")) {
      bySubstancePair.set(key, c);
    }
  }

  return Array.from(bySubstancePair.values()).sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "avoid" ? -1 : 1,
  );
}
