---
name: Blends must occupy one slot
description: Why multi-ingredient products are placed as a single indivisible unit in the timing engine
---

# Multi-ingredient products get ONE slot

The timing engine flattens products into ingredients, but a multi-ingredient
product (a blend, e.g. "Cort Eaze", 6 ingredients in one capsule) is physically
ONE dose — you cannot swallow its ingredients at different times.

**Rule:** any product with more than one ingredient must be placed in a single
slot as one grouped pill (`Name (N-in-1 blend)`). Only single-ingredient
products get the per-ingredient ideal-slot logic.

**Why:** a real user (blend "Cort Eaze") reported the engine told them to take
ingredient 1 in the morning, 2 midday, 3 at night — impossible for one capsule.

**How to apply:** blend slot is chosen for least harm, sleep/alertness first —
evening/calming -> wind-down; morning-fasted/energizing -> morning; a blend
containing BOTH -> daytime meal with an explicit heads-up note (no time is
perfect); otherwise with a meal. A non-conflicting blend carrying a
medication-sensitive mineral nudges to a meal clear of meds. Known gap: that
med-spacing nudge only fires when the blend first lands on a meal slot, not when
it lands on wake/wind-down. The blend trigger is `ingredients.length > 1`, not
the `type` column, so scanned products behave correctly even if `type` is wrong.
