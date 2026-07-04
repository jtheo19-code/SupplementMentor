---
name: Ingredient catalog quality policy
description: What kinds of entries belong (and don't) in ingredientLibrary.ts, the standalone supplement catalog
---

# Ingredient catalog quality policy

The `ingredientLibrary.ts` list is the single source of the standalone supplement catalog (one product per entry). When expanding it, keep entries to genuine, mainstream dietary supplement ingredients.

**Exclude** (they erode a consumer supplement app's credibility and raise safety/regulatory concerns):
- Research chemicals / drug-like nootropics that aren't sold as dietary supplements (e.g. methylene blue, galantamine).
- Banned or high-risk stimulants (e.g. higenamine, octopamine, rauwolscine/alpha-yohimbine).
- Toxic or hepatotoxic botanicals (e.g. germanium sesquioxide, chaparral).
- Pseudo-vitamins with no recognized status (e.g. "vitamin B15/pangamic acid", "vitamin B13/orotic acid").

**Why:** A code review flagged these after a bulk expansion; they were swapped for clean mainstream ingredients while preserving the target count.

**How to apply:** When asked to grow the catalog to N entries, verify final count and uniqueness programmatically (regex the `name:` fields), and screen new names against the exclusions above. Note: some borderline nootropics/stimulants (racetams, yohimbine HCl) predate this policy and remain; don't remove pre-existing entries unless asked.
