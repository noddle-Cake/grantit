# Grantit

Grant management for small nonprofits: a verified knowledge base, grounded AI drafting of applications,
and grant-by-grant expenditure tracking in each funder's own reporting period.

The repo currently holds the **web UI MVP** — a fully clickable front end running on demo data stored in
the browser. There is no backend yet. See [`docs/requirements.md`](docs/requirements.md) for the
requirements and what's built.

## Quick start

Requires Node.js 22.18+ (`web/.nvmrc` pins 24).

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run check` | Type-check, lint, and unit tests (what CI runs) |
| `npm test` | Unit tests for the domain logic in `src/lib` |
| `npm run build` | Type-check and build for Cloudflare |
| `npm run deploy` | Build and deploy to Cloudflare (needs `npx cf auth login`) |

## Repository layout

```
.
├── .github/workflows/ci.yml   CI: checks every PR, deploys main to Cloudflare
├── docs/requirements.md       Functional requirements + build status
└── web/                       React app (Vite, TypeScript, Tailwind v4)
    ├── cloudflare.config.ts   Cloudflare Worker (static assets) + custom domain
    └── src/
        ├── app/               App root, routes (lazy-loaded), shell/navigation
        ├── features/          One folder per area of the product
        │   ├── dashboard/
        │   ├── grants/        list, record page, tabs/, new-grant modal
        │   ├── knowledge/     knowledge base + fact editor
        │   ├── transactions/  ledger, allocation drawer, CSV import
        │   ├── reports/
        │   ├── team/
        │   └── settings/
        ├── components/        Shared UI: ui/ kit, Logo, timeline, chart
        ├── lib/               Framework-free domain logic (+ *.test.ts)
        ├── store/             App state provider and useStore() hook
        ├── data/seed.ts       Demo organization, grants, and ledger
        └── types.ts           Domain model
```

**Conventions**

- Imports use the `@/` alias for `src/`. Files within one feature import each other relatively (`./tabs/…`).
- Business rules (budget periods, compliance flags, drafting, permissions) live in `src/lib` as pure functions
  with unit tests. Components stay presentational.
- `lib/drafting.ts` defines the `DraftResult` contract (text + citations + missing topics) that a real
  LLM service must return, so the UI won't change when the backend is wired in.

## Design direction

- **HubSpot-style CRM foundation:** navy side nav, orange primary actions, slate type on a cool-grey canvas,
  filterable tables with table/board/card views, three-column record pages, and slide-in side panels.
- **Luma-inspired accents:** gradient covers per grant, date tiles on a dotted deadline timeline,
  relative-day labels, pill segmented controls, and a Luma-style "create" sheet for new grants.

## Deployment

Every push to `main` deploys to Cloudflare Workers via GitHub Actions. The workflow needs two repository
secrets: `CLOUDFLARE_API_TOKEN` (Workers edit + zone DNS) and `CLOUDFLARE_ACCOUNT_ID`.
