# Tidepath

Grant management for small nonprofits: a verified knowledge base, grounded AI drafting of applications,
and grant-by-grant expenditure tracking in each funder's own reporting period.

This repo currently contains the **UI MVP** (`web/`) — a fully clickable front end running on mock data
persisted in `localStorage`. No backend yet.

## Run it

```bash
cd web
npm install
npm run dev
```

## Design direction

- **HubSpot-style CRM foundation** — dark navy left nav, orange primary actions, slate type on a cool-grey
  canvas, data tables with filter chips, table/board views, and three-column record pages
  (about · tabs · associations) with slide-in side panels.
- **Luma-inspired accents** — soft gradient covers per grant, date tiles on a dotted timeline for deadlines,
  relative-day labels ("In 14 days"), segmented pill controls, and the Luma-style "create" sheet
  (cover, large title, compact property rows) for new grants.

## What's covered (P0 + selected P1)

| Area | Screens |
|---|---|
| Knowledge base | Facts with draft → needs approval → approved workflow, category coverage + gap detection, source/evidence, past documents, learned writing style |
| Grant configuration | Per-grant questions & word limits, approved budget categories, funding period independent of fiscal year, funder rules, deadlines, split-allocation permission |
| AI drafting | Generates answers **only** from approved facts, cites sources per answer, fits word limits, flags missing info instead of inventing it, flags unsupported figures, review / edit / regenerate / approve, application validation |
| Accounting | CSV import (+ template, QuickBooks sample), assign / split transactions across grants, flags for unassigned, unauthorized category, over budget, outside period, split-not-allowed; bulk review |
| Dashboards & reports | Org-wide home dashboard, per-grant budget vs actual by category, monthly spend, funder period vs org fiscal-year toggle, CSV expenditure report, reporting checklist |
| Roles | Director / Finance / Program staff with a permission matrix — switch users from the account menu to preview |

## Structure

```
web/src
├── types.ts            domain model
├── data/seed.ts        demo organization, grants, ledger
├── store/AppStore.tsx  state + actions (swap for API calls later)
├── lib/
│   ├── drafting.ts     grounded drafting contract + mock engine, claim validation
│   ├── finance.ts      period math, category spend, compliance flags
│   ├── permissions.ts  role → capability matrix
│   └── report.ts       expenditure report export
├── components/         UI kit (ui.tsx), app shell, timeline, chart
└── pages/              dashboard, grants, grant record tabs, knowledge base, transactions, reports, team, settings
```

`lib/drafting.ts` exposes `draftAnswer()` with the same `DraftResult` contract a real LLM service should
return (text + citations + missing topics), so the UI won't change when the backend is wired in.
