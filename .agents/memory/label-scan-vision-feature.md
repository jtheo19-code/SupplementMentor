---
name: Label scan via vision LLM
description: How supplement label photo scanning is implemented — no object storage, ephemeral image, client cache for display
---

Supplement label photos are sent as base64 directly in the JSON request body to a vision LLM endpoint and are never persisted — only the extracted ingredients are saved as a new `products` row. No object storage bucket is needed for this feature.

**Why:** the image itself has no lasting value once ingredients are extracted; persisting it would add storage cost/complexity for no product benefit.

**How to apply:** if extending this flow (e.g. re-scanning, editing before save), keep the "image is ephemeral, only extracted data persists" pattern unless a future requirement (audit trail, user photo gallery) explicitly needs the raw image kept.

Products added via scan (or any product not present in the current search/popular list results) won't visually appear in a search-result-driven picker UI after being added. The wizard/session state needs its own `id -> full object` cache (not just a list of ids) so a "your stack" summary can render selected items' names even when they're not part of the currently loaded list query.

**Why:** the stack builder list only renders whatever the current search/popular query returned; a scanned product has no reason to appear in that query's results.

**How to apply:** whenever an item can be added to a selection from a source other than the visible list (scan, deep link, etc.), cache the full object client-side at add-time rather than just its id.
