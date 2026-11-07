# Grantit

Grant management for small nonprofits: a verified knowledge base, grounded AI drafting of applications,
and grant-by-grant expenditure tracking in each funder's own reporting period.

The web app has two workspaces:

- **Find & apply**: opportunities recommended from the organization's approved facts, the application
  pipeline, each application's readiness, and the knowledge base drafts are grounded in.
- **Manage funds**: awarded grants, spending checked against each grant's categories in the funder's own
  period, and reports.

The **web UI MVP** is a fully clickable front end running on demo data stored in the browser. The **API**
(Hono + Postgres) is being built in phases; see [`docs/roadmap.md`](docs/roadmap.md) and the
[requirements](docs/requirements.md).

## Quick start

Requires Node.js 22.18+ (`.nvmrc` pins 24) and, for the API, Docker.

```bash
npm install            # installs all three workspaces
npm run dev:web        # web app on http://localhost:5173 (demo data, no API needed)

npm run db:up          # Postgres in Docker on localhost:54329
cp api/.env.example api/.env
npm run db:migrate     # apply migrations
npm run db:seed        # load the demo organization
npm run dev:api        # API on http://127.0.0.1:8787/api (Vite proxies /api to it)
```

| Command (from the repo root) | What it does |
|---|---|
| `npm run check` | Type-check, lint, and test every workspace (what CI runs; API tests need `db:up`) |
| `npm run check -w shared` | Just one workspace: `shared`, `api`, or `web` |
| `npm run build` | Build the web app to `web/dist` |
| `npm run db:up` / `db:down` | Start / stop local Postgres |
| `npm run db:migrate` | Apply migrations in `api/drizzle` |
| `npm run db:seed` | Replace the demo organization's data with `shared/src/seed.ts` |
| `npm run db:generate -w api` | Generate a migration after editing `api/src/db/schema.ts` |

## Repository layout

```
.
├── .github/workflows/ci.yml   CI on GitHub-hosted runners: checks + build
├── compose.yaml               Local Postgres for the API
├── deploy/                    5820 deploy script and nginx config
├── docs/
│   ├── requirements.md        Functional requirements + build status
│   ├── roadmap.md             Phases and issues (generated from scripts/backlog)
│   ├── api.md                 API conventions
│   ├── adr/                   Architecture decisions
│   └── deploy.md              Hosting, deploys, CI
├── scripts/backlog/           GitHub issues / Linear project generator
├── shared/                    @grantit/shared: used by both web and API
│   └── src/
│       ├── types.ts           Domain model
│       ├── finance.ts         Spending per funding period, compliance flags (+ tests)
│       ├── drafting.ts        DraftResult contract, word limits, validation (+ tests)
│       ├── permissions.ts     Role × action matrix
│       ├── workspaces.ts      Which stages belong to Find & apply vs. Manage funds
│       ├── opportunities.ts   Recommending opportunities from approved facts (+ tests)
│       ├── deadlines.ts, format.ts
│       └── seed.ts            Demo organization, grants, and ledger
├── api/                       @grantit/api: Hono HTTP API
│   ├── drizzle/               SQL migrations (generated, checked in)
│   └── src/
│       ├── app.ts             Routes, mounted under /api
│       ├── http.ts            Error shape, pagination, organization scoping
│       ├── routes/            One file per resource
│       └── db/                Drizzle schema, client, migrate and seed scripts
└── web/                       React app (Vite, TypeScript, Tailwind v4)
    └── src/
        ├── app/               App root, routes (lazy-loaded), shell/navigation
        ├── features/          apply/ and funds/ workspaces, plus grants, knowledge, transactions, reports
        ├── components/        Shared UI: ui/ kit, Logo, timeline, chart
        ├── lib/               UI-only helpers (labels, CSV report export)
        └── store/             App state provider and useStore() hook
```

**Conventions**

- Business rules live in `shared/src` as pure functions with unit tests, so the UI and the API apply the same
  rules. Components stay presentational.
- In `web/`, imports use the `@/` alias for `web/src/` and `@grantit/shared/<module>` for shared code. Inside
  `shared/` and `api/`, relative imports include the `.ts` extension (Node runs the TypeScript directly).
- `shared/src/drafting.ts` defines the `DraftResult` contract (text + citations + missing topics) that the real
  LLM service must return, so the UI won't change when the backend is wired in.
- API endpoints follow [`docs/api.md`](docs/api.md). Stack decision: [ADR 0001](docs/adr/0001-backend.md).

## Design direction

- **HubSpot-style CRM foundation:** navy side nav, orange primary actions, slate type on a cool-grey canvas,
  filterable tables with table/board/card views, three-column record pages, and slide-in side panels.
- **Luma-inspired accents:** gradient covers per grant, date tiles on a dotted deadline timeline,
  relative-day labels, pill segmented controls, and a Luma-style "create" sheet for new grants.

## Deployment

Live at **https://grantit.joseyandco.com**, served from the 5820 home server through the Cloudflare Tunnel.
CI runs on GitHub-hosted runners; deploys are `sudo bash ~/srv-setup/31-grantit.sh` on 5820.
Details in [`docs/deploy.md`](docs/deploy.md).
