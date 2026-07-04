---
name: Medication safety checks must use the full named list
description: Contraindication/interaction detection must run on every named medication, not the timing-filtered subset
---

Interaction/contraindication detection in the timing engine must run against
**every medication the user named**, independent of whether they set an anchor
time for it.

**Why:** The timing engine filters medications to those with BOTH a name and a
time (the spacing/absorption logic needs a concrete time). Feeding that same
time-filtered list into `detectContraindications` silently dropped any
medication the user typed without pinning a time — so a real, dangerous pair
(e.g. methylene blue + Lexapro) produced no warning. A user often adds a
medication just to check interactions and never sets a clock time for it.

**How to apply:** Keep two lists in the engine: the time-filtered
`medications` (for scheduling/spacing) and a separate `allMedicationNames`
(trimmed, non-empty, no time requirement) used for safety detection. Any future
safety/interaction check that keys off medications must consume the full named
list, not the scheduling subset.
