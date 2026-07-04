---
name: Anchor time empty-string coercion
description: Optional time-anchor fields arrive as "" from the frontend and must be treated as absent, not midnight.
---

# Optional anchor times: `""` is not absent

Optional time fields in the timing engine's Anchors input (e.g. `coffeeTime`) arrive from the frontend as an empty string `""` when the user leaves them blank, NOT as `null`/`undefined`.

**The trap:** a guard like `anchors.coffeeTime != null ? timeToMinutes(anchors.coffeeTime) : null` passes `""` through, and `timeToMinutes("")` returns `0` → a bogus anchor rendered at `00:00` (e.g. a phantom "Coffee (your anchor)" at midnight).

**Fix:** treat blank strings as absent — check `field != null && field.trim() !== ""` before parsing.

**Why:** the wizard's default anchors seed optional time fields with `""`, and untouched fields are submitted verbatim.

**How to apply:** any new optional time/anchor field (medication times are guarded by a name+time filter, so they're safe) needs the same empty-string guard, not just a null check.
