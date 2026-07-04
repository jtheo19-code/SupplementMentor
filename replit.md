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
- `artifacts/api-server/src/lib/seedProducts.ts` — seed catalog of standalone compounds and blends
- `artifacts/api-server/src/lib/timingEngine.ts` — server-side slot assignment + stack audit logic
- `artifacts/api-server/src/routes/` — `products.ts`, `timing.ts`, `leads.ts` route handlers
- `artifacts/supps-timer/src/pages/` — `StackBuilder.tsx` (/), `DayAnchors.tsx` (/anchors), `TimingMap.tsx` (/map)
- `artifacts/supps-timer/src/lib/WizardContext.tsx` — client-side 3-step wizard state

## Architecture decisions

- Timing engine runs server-side (not client) so timing logic/citations stay a single source of truth and can evolve without a frontend redeploy.
- Product search matches both product name and nested ingredient names, since blends only expose their compounds as ingredients, not in the product name.
- Stack audit only surfaces ingredients appearing in 2+ distinct selected products (not every duplicate mg total) to keep the audit signal actionable.
- Email capture is placed below an already-functional timing map so users get value before being asked for their email.

## Product

- Step 1 (`/`): search/add standalone compounds and blends to build a stack; blends show ingredient breakdown.
- Step 2 (`/anchors`): set wake/breakfast/dinner/bed times, optional medication anchor with gap requirement, optional coffee time.
- Step 3 (`/map`): chronological timing map with per-placement reasons/citations, stack audit for duplicated ingredients, and an email capture form.

## User preferences

- No emojis anywhere in the UI.
- Mobile-first PWA, but should look intentional on desktop.

## Gotchas

- When adding/searching products with nested ingredients, always match against ingredient names too, not just the top-level product name — see `.agents/memory/product-search-ingredient-matching.md`.
- Do not restart the `supps-timer` frontend workflow while a design subagent is still running against it.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
