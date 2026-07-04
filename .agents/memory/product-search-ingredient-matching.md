---
name: Product search must include ingredients
description: When building a product/supplement search endpoint where items can be blends composed of sub-ingredients, matching only on the top-level product name silently breaks searches for the ingredient itself.
---

If users can search for a compound (e.g. "Ashwagandha") that only appears as an ingredient inside a blend product (e.g. "Cort-Eaze", "Adrena-Calm"), a search filter that checks `product.name` alone will return zero results even though the data is present and the request succeeds (200 OK) — the bug looks like a frontend rendering issue but is actually a backend filter gap.

**Why:** Discovered via e2e testing on a supplement-stack app: search for "Ashwagandha" returned `[]` because the filter only checked product name, not the nested ingredients array, even though two blend products contained that ingredient.

**How to apply:** When implementing search/filter logic over composite items (products with sub-ingredients, bundles with line items, etc.), match against both the top-level name AND any nested/child item names unless there's an explicit reason not to.
