# Supps Timer

A supplement stack timing PWA: users build their supplement stack, anchor their day (wake/meals/bed/optional medication/coffee), and get a chronological timing map with reasons/citations for each placement plus a stack audit that flags duplicated ingredients across products.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/supps-timer run dev` — run the Supps Timer web frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite, wouter routing, shadcn/ui components

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for API contract (products, timing-map, leads endpoints)
- `lib/db/src/schema/products.ts` / `leads.ts` — DB schema (products with jsonb ingredients, leads)
- `artifacts/api-server/src/lib/seedProducts.ts` — seed catalog of standalone single-ingredient compounds (no blends)
- `artifacts/api-server/src/lib/timingEngine.ts` — server-side slot assignment + stack audit logic
- `artifacts/api-server/src/lib/contraindications.ts` — supplement×medication interaction detection (serotonin syndrome, warfarin/vitamin K, hyperkalemia, etc.)
- `artifacts/api-server/src/routes/` — `products.ts`, `timing.ts`, `leads.ts` route handlers
- `artifacts/supps-timer/src/pages/` — `StackBuilder.tsx` (/), `DayAnchors.tsx` (/anchors), `TimingMap.tsx` (/map)
- `artifacts/supps-timer/src/lib/WizardContext.tsx` — client-side 3-step wizard state

## Architecture decisions

- Timing engine runs server-side (not client) so timing logic/citations stay a single source of truth and can evolve without a frontend redeploy.
- Catalog is standalone single-ingredient products only (one per library ingredient). Multi-ingredient products (blends) are NOT generated into the catalog — users add their own by scanning a label photo, so the catalog stays a clean list of individual compounds.
- Product search matches both product name and nested ingredient names (a product may still carry multiple ingredients once added via label scan).
- Stack audit only surfaces ingredients appearing in 2+ distinct selected products (not every duplicate mg total) to keep the audit signal actionable.
- Contraindication detection is deliberately conservative: only well-established, cited pharmacodynamic interactions are encoded, and every surfaced warning must involve at least one supplement (supplement×medication or serotonergic supplement stacking). Medication×medication combos are out of scope (the user's prescriber manages those). Absorption-timing spacing (minerals vs thyroid meds) stays in the timing engine and is not duplicated here.
- Email capture is placed below an already-functional timing map so users get value before being asked for their email.

## Product

- Step 1 (`/`): search/add standalone compounds to build a stack, or scan a supplement label photo to auto-extract and add a multi-ingredient product.
- Step 2 (`/anchors`): set wake/breakfast/dinner/bed times, optional medication anchor with gap requirement, optional coffee time.
- Step 3 (`/map`): chronological timing map with per-placement reasons/citations, interaction warnings (contraindications between the stack and the user's medications, with an "avoid"/"caution" severity and a not-medical-advice disclaimer), stack audit for duplicated ingredients, and an email capture form.

## User preferences

- No emojis anywhere in the UI.
- Mobile-first PWA, but should look intentional on desktop.

## Gotchas

- When adding/searching products with nested ingredients, always match against ingredient names too, not just the top-level product name — see `.agents/memory/product-search-ingredient-matching.md`.
- Do not restart the `supps-timer` frontend workflow while a design subagent is still running against it.
- The `api-server` dev workflow does NOT hot-reload (its dev script is `build && start`). After changing any server code or regenerating codegen, restart the `artifacts/api-server: API Server` workflow before live requests reflect the change. The Vite frontend (`supps-timer`) does hot-reload.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
