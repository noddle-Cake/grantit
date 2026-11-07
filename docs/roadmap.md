# Grantit roadmap

Feature map of Grantit, from the web UI MVP onward. GitHub issues are the source of truth; Linear mirrors them
through GitHub Issues Sync, in the Linear project "Grantit". Generated from `scripts/backlog/backlog.json` with
`node scripts/backlog/create-issues.mjs --roadmap`. Priorities match [requirements.md](requirements.md).

```mermaid
flowchart LR
  M1["M0 · Web UI MVP"]
  M2["Phase 1 · Foundations"]
  M3["Phase 2 · Parallel build"]
  M4["Phase 3 · Integration"]
  M5["Phase 4 · Testing & demo"]
  M6["Later"]
  M1 --> M2
  M2 --> M3
  M3 --> M4
  M4 --> M5
  M5 --> M6
```

## M0 · Web UI MVP

Clickable web UI on demo data: every requirement marked built in docs/requirements.md.

### ✅ Web UI MVP

| Priority | Issue | Requirement | Area |
|---|---|---|---|
| P0 | ✅ Store an organization's mission, programs, services, beneficiaries, and measurable outcomes | knowledge base |  |
| P0 | ✅ Allow staff to add, edit, and approve organizational facts | knowledge base |  |
| P0 | ✅ Generate application responses using only approved organizational facts | knowledge base |  |
| P0 | ✅ Show which stored facts support each generated response | knowledge base |  |
| P1 | ✅ Identify missing information rather than inventing it | knowledge base |  |
| P0 | ✅ Create and manage individual grant records | grant setup |  |
| P0 | ✅ Define a unique set of application questions for each grant | grant setup |  |
| P0 | ✅ Configure individual word limits for every question | grant setup |  |
| P0 | ✅ Define each grant's approved budget and spending categories | grant setup |  |
| P0 | ✅ Configure each grant's reporting year or funding period independently of the organization's fiscal year | grant setup |  |
| P1 | ✅ Store individual funder rules, restrictions, and reporting requirements | grant setup |  |
| P1 | ✅ Track application and reporting deadlines | grant setup |  |
| P1 | ✅ Support multiple simultaneous grants with different configurations | grant setup |  |
| P0 | ✅ Enforce each question's word limit automatically | AI drafting |  |
| P0 | ✅ Ensure generated statements are supported by approved information | AI drafting |  |
| P0 | ✅ Allow users to review, edit, approve, and regenerate answers | AI drafting |  |
| P1 | ✅ Validate completed applications for unanswered questions, unsupported claims, and exceeded word limits | AI drafting |  |
| P0 | ✅ Import a set of financial transactions, initially through CSV or sample QuickBooks data | accounting |  |
| P0 | ✅ Assign transactions to grants and approved spending categories | accounting |  |
| P0 | ✅ Calculate spending for each grant within its own funding period or fiscal year | accounting |  |
| P0 | ✅ Display approved budget, actual spending, and remaining balances for each category | accounting |  |
| P0 | ✅ Flag transactions assigned to unauthorized categories or exceeding approved category budgets | accounting |  |
| P1 | ✅ Detect categories approaching their spending limits | accounting |  |
| P1 | ✅ Allow staff to review and correct transaction classifications | accounting |  |
| P1 | ✅ Support allocating a transaction across multiple grants when permitted | accounting |  |
| P0 | ✅ Show a grant overview with its funding amount, spending, and remaining balance | dashboards & reports |  |
| P0 | ✅ Visualize expenditure by grant spending category | dashboards & reports |  |
| P0 | ✅ Display financial information using the funder's configured reporting period | dashboards & reports |  |
| P1 | ✅ Provide an organization-wide dashboard summarizing multiple grants | dashboards & reports |  |
| P1 | ✅ Track application status, deadlines, and reporting obligations | dashboards & reports |  |
| P1 | ✅ Generate grant-specific expenditure reports | dashboards & reports |  |
| P0 | ✅ Allow the director to configure grants, draft applications, and approve information | roles & workflow |  |
| P0 | ✅ Allow financial staff to review transactions, categories, and spending compliance | roles & workflow |  |
| P1 | ✅ Allow program staff to contribute and approve program information | roles & workflow |  |
| P1 | ✅ Track the status of applications, narrative drafts, financial checks, and reports | roles & workflow |  |

## Phase 1 · Foundations

Together: define the database schema, sample data, API conventions, and project structure.

### Backend & persistence

| Priority | Issue | Requirement | Area |
|---|---|---|---|
| P0 | Decide backend stack and hosting (ADR) |  | backend |
| P0 | Set up project structure for the API and shared code |  | backend |
| P0 | Database schema and migrations for the domain model |  | backend |
| P0 | Define API conventions |  | backend |

## Phase 2 · Parallel build

In parallel: Chris builds the AI application workflow; Sam builds financial tracking and validation.

### Backend & persistence

| Priority | Issue | Owner | Requirement | Area |
|---|---|---|---|---|
| P0 | REST API for grants, facts and questions | Chris |  | backend |
| P0 | Finance API: transactions, allocations, spending and compliance flags | Sam | accounting | backend, finance |
| P0 | Server-side CSV transaction import | Sam | accounting | backend, finance |

### Grounded AI drafting

| Priority | Issue | Owner | Requirement | Area |
|---|---|---|---|---|
| P0 | Drafting service behind the DraftResult contract | Chris | AI drafting | ai |
| P0 | Validate citations and reject unsupported claims | Chris | AI drafting | ai |
| P0 | Enforce word limits on generated answers | Chris | AI drafting | ai |
| P1 | Report missing information instead of inventing it | Chris | knowledge base | ai |
| P0 | Grounding evaluation suite | Chris | AI drafting | ai, ops |

### Find funding

| Priority | Issue | Owner | Requirement | Area |
|---|---|---|---|---|
| P1 | Split the web app into Find & apply and Manage funds | Chris |  | discovery |

## Phase 3 · Integration

Connect both workflows through a shared grant detail page.

### Backend & persistence

| Priority | Issue | Requirement | Area |
|---|---|---|---|
| P0 | Move the web store from browser storage to the API |  | backend |

### Integration & demo

| Priority | Issue | Requirement | Area |
|---|---|---|---|
| P0 | Shared grant detail page on the live API | grant setup | backend |

## Phase 4 · Testing & demo

Demonstrate a fact-grounded application and a correctly identified spending violation.

### Backend & persistence

| Priority | Issue | Requirement | Area |
|---|---|---|---|
| P0 | Deploy the API on 5820 with database backups |  | backend, ops |

### Quality & operations

| Priority | Issue | Requirement | Area |
|---|---|---|---|
| P1 | End-to-end tests for core flows |  | ops |

### Integration & demo

| Priority | Issue | Requirement | Area |
|---|---|---|---|
| P0 | Demo: fact-grounded application and a flagged spending violation |  | ops |

## Later

After the demo: accounts and roles, documents, QuickBooks, exports, alerts, and operations.

### Accounts, organizations & roles

| Priority | Issue | Requirement | Area |
|---|---|---|---|
| P0 | User sign-in | roles & workflow | auth |
| P0 | Organizations and team invites | roles & workflow | auth |
| P2 | Enforce role permissions on the server | roles & workflow | auth |
| P2 | Multi-user approval workflow for facts and answers | roles & workflow | auth, knowledge |

### Grounded AI drafting

| Priority | Issue | Requirement | Area |
|---|---|---|---|
| P1 | Match the organization's tone and writing style | AI drafting | ai |
| P1 | Reuse relevant answers from past applications | AI drafting | ai |
| P1 | Usage limits and cost logging for drafting | AI drafting | ai, ops |

### Knowledge base documents

| Priority | Issue | Requirement | Area |
|---|---|---|---|
| P1 | Upload past applications and reports | knowledge base | knowledge |
| P1 | Extract candidate facts from uploaded documents | knowledge base | knowledge, ai |
| P1 | Build a writing style profile from approved examples | knowledge base | knowledge, ai |

### QuickBooks & expenditure audit

| Priority | Issue | Requirement | Area |
|---|---|---|---|
| P1 | Connect QuickBooks Online | accounting | finance |
| P1 | Sync QuickBooks transactions and map accounts to categories | accounting | finance |
| P2 | Audit trail for expenditure changes and approvals | accounting | finance |

### Reports, exports & alerts

| Priority | Issue | Requirement | Area |
|---|---|---|---|
| P2 | Export applications to DOCX and PDF | AI drafting | reports |
| P1 | PDF expenditure report per grant | dashboards & reports | reports |
| P2 | Auto-draft narrative and financial reports before deadlines | dashboards & reports | reports, ai |
| P2 | Email alerts for deadlines and projected overruns | dashboards & reports | reports |

### Quality & operations

| Priority | Issue | Requirement | Area |
|---|---|---|---|
| P1 | Error monitoring for web and API |  | ops |
| P1 | Accessibility audit and fixes |  | ops |

### Find funding

| Priority | Issue | Owner | Requirement | Area |
|---|---|---|---|---|
| P1 | Serve opportunity recommendations from the API | Chris |  | discovery, backend |
| P1 | Search public grant listings for new opportunities | Chris |  | discovery |
