# Grantit — Functional Requirements

**P0** = Required MVP · **P1** = High-priority extension · **P2** = Stretch goal

Status reflects the web UI in `web/` (mock data, no backend yet): ✅ built · 🟡 partial / UI only · ⬜ not started.

## 1. Organization knowledge base

The platform needs a reliable source of information from which to generate grant applications.

| Priority | Requirement | Status |
|---|---|---|
| P0 | Store an organization's mission, programs, services, beneficiaries, and measurable outcomes. | ✅ |
| P0 | Allow staff to add, edit, and approve organizational facts. | ✅ |
| P0 | Generate application responses using only approved organizational facts. | ✅ |
| P0 | Show which stored facts support each generated response. | ✅ |
| P1 | Store previous grant applications and reports for reuse. | ⬜ sample documents retained in data; upload and reuse UI not implemented |
| P1 | Learn the organization's writing style from approved examples. | ⬜ |
| P1 | Identify missing information rather than inventing it. | ✅ |

## 2. Grant-specific configuration

Every funder can impose different requirements, and the application must support them independently.

| Priority | Requirement | Status |
|---|---|---|
| P0 | Create and manage individual grant records. | ✅ |
| P0 | Define a unique set of application questions for each grant. | ✅ |
| P0 | Configure individual word limits for every question. | ✅ |
| P0 | Define each grant's approved budget and spending categories. | ✅ |
| P0 | Configure each grant's reporting year or funding period independently of the organization's fiscal year. | ✅ |
| P1 | Store individual funder rules, restrictions, and reporting requirements. | ✅ |
| P1 | Track application and reporting deadlines. | ✅ |
| P1 | Support multiple simultaneous grants with different configurations. | ✅ |

## 3. AI grant application drafting

| Priority | Requirement | Status |
|---|---|---|
| P0 | Generate answers to grant application questions using the approved knowledge base. | 🟡 mock engine |
| P0 | Enforce each question's word limit automatically. | ✅ |
| P0 | Ensure generated statements are supported by approved information. | ✅ |
| P0 | Allow users to review, edit, approve, and regenerate answers. | ✅ |
| P1 | Match the organization's tone and writing style. | ⬜ |
| P1 | Reuse relevant answers from previous applications without blindly copying them. | ⬜ |
| P1 | Validate completed applications for unanswered questions, unsupported claims, and exceeded word limits. | ✅ |
| P2 | Export applications into funder-specific templates or submission formats. | ⬜ |

## 4. Grant accounting and expenditure verification

| Priority | Requirement | Status |
|---|---|---|
| P0 | Import a set of financial transactions, initially through CSV or sample QuickBooks data. | ✅ Grantit template or QuickBooks export headers; duplicates skipped; refunds supported |
| P0 | Assign transactions to grants and approved spending categories. | ✅ by category id; only grants with confirmed setup |
| P0 | Calculate spending for each grant within its own funding period or fiscal year. | ✅ grant period, funder fiscal years and quarters, org fiscal years |
| P0 | Display approved budget, actual spending, and remaining balances for each category. | ✅ |
| P0 | Flag transactions assigned to unauthorized categories or exceeding approved category budgets. | ✅ exact cents, overage amount, checked against the grant period |
| P1 | Connect directly to QuickBooks. | ⬜ (QuickBooks export CSV accepted) |
| P1 | Detect categories approaching their spending limits. | ✅ |
| P1 | Allow staff to review and correct transaction classifications. | ✅ edits reset review; "not grant-funded" marking |
| P1 | Support allocating a transaction across multiple grants when permitted. | ✅ |
| P2 | Maintain a detailed audit trail of expenditure changes and approvals. | ⬜ |
| — | Confirm each award's period and budget ("Needs setup") before it can receive transactions, with optional AI autofill from the award letter PDF. | ✅ OpenAI, key entered in Settings |

## 5. Dashboards and reports

| Priority | Requirement | Status |
|---|---|---|
| P0 | Show a grant overview with its funding amount, spending, and remaining balance. | ✅ |
| P0 | Visualize expenditure by grant spending category. | ✅ |
| P0 | Display financial information using the funder's configured reporting period. | ✅ incl. funder fiscal year and quarterly table |
| P1 | Provide an organization-wide dashboard summarizing multiple grants. | ✅ |
| P1 | Track application status, deadlines, and reporting obligations. | ✅ |
| P1 | Generate grant-specific expenditure reports. | ✅ CSV |
| P2 | Automatically draft narrative and financial reports when reporting deadlines approach, using verified information. | ⬜ |
| P2 | Alert staff about upcoming deadlines and projected budget overruns. | 🟡 in-app only |

## 6. User roles and workflow

| Priority | Requirement | Status |
|---|---|---|
| P0 | Allow the director to configure grants, draft applications, and approve information. | ✅ |
| P0 | Allow financial staff to review transactions, categories, and spending compliance. | ✅ |
| P1 | Allow program staff to contribute and approve program information. | ✅ |
| P1 | Track the status of applications, narrative drafts, financial checks, and reports. | ✅ |
| P2 | Support role-based permissions and multi-user approval workflows. | 🟡 roles simulated, no auth |
