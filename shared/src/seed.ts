import { allocationFor } from './finance.ts'
import type { Allocation, AppState, Fact, Grant, Transaction } from './types.ts'

// Demo data for Tidepath Family Alliance, a made-up Miami-Dade nonprofit that helps kids and their families
// through mentoring, family counseling, and safety and mental health workshops in schools. Every person,
// funder, vendor and number here is invented.
//
// What the demo shows:
// - Funders' years start in January, July or October; Tidepath's own fiscal year is the calendar year.
// - Youth Mental Health Partnership (drafting) asks questions with 250- and 1,000-word limits, to draft live
//   from the approved facts.
// - Anchor Mentors 2026 has one transaction of each compliance problem: over budget, unauthorized category,
//   outside the funding period. Mentor Training and Counselors are close to running over.
// - Family Nights 2026 runs exactly $300 over its $5,000 Family Events budget.
// - Family Counseling Access has a refund (a negative amount) that reduces Family Support spending.
// - Family Wellness Partnership was just awarded and still needs setup: upload its sample award letter
//   (web/public/samples) on the Setup tab to fill in the budget.

const facts: Fact[] = [
  {
    id: 'f-mission',
    category: 'mission',
    title: 'Mission statement',
    content:
      'Tidepath Family Alliance helps children and teens in Miami-Dade County and their families build safe, connected, and resilient lives through mentoring, family counseling, and safety and mental health workshops in schools.',
    tags: ['mission', 'youth', 'families', 'mentoring', 'counseling', 'mental-health', 'safety'],
    status: 'approved',
    source: 'Board-approved strategic plan 2025–2028',
    updatedAt: '2026-02-11',
    updatedBy: 'u-claudette',
    approvedBy: 'u-claudette',
    approvedAt: '2026-02-11',
  },
  {
    id: 'f-history',
    category: 'organization',
    title: 'Founding and history',
    content:
      'Founded in 2011 by a school social worker and a group of parents, Tidepath began as a weekend mentoring club and now runs programs in 14 public schools and two family centers.',
    tags: ['history', 'organization', 'capacity', 'schools'],
    status: 'approved',
    updatedAt: '2026-02-11',
    updatedBy: 'u-claudette',
    approvedBy: 'u-claudette',
    approvedAt: '2026-02-11',
  },
  {
    id: 'f-mentoring',
    category: 'program',
    title: 'Anchor Mentors program',
    content:
      'Anchor Mentors pairs youth ages 10 to 17 with screened, trained adult volunteers who meet weekly for at least 12 months. Mentors and mentees also join a monthly group outing.',
    tags: ['mentoring', 'mentorship', 'youth', 'volunteers', 'program'],
    status: 'approved',
    updatedAt: '2026-03-02',
    updatedBy: 'u-luis',
    approvedBy: 'u-claudette',
    approvedAt: '2026-03-04',
  },
  {
    id: 'f-counseling',
    category: 'service',
    title: 'Family counseling',
    content:
      'Licensed family therapists provide free short-term family counseling, 8 to 12 sessions, at our two family centers and by telehealth. Sessions are offered in English, Spanish, and Haitian Creole.',
    tags: ['counseling', 'families', 'mental-health', 'bilingual', 'services'],
    status: 'approved',
    updatedAt: '2026-03-02',
    updatedBy: 'u-luis',
    approvedBy: 'u-claudette',
    approvedAt: '2026-03-04',
  },
  {
    id: 'f-workshops',
    category: 'program',
    title: 'Safe & Strong school workshops',
    content:
      'Safe & Strong is a six-session workshop series for students in grades 4 to 12, led by trained facilitators during the school day. It covers bullying prevention, online safety, coping skills, and how to ask a trusted adult for help.',
    tags: ['workshops', 'safety', 'schools', 'mental-health', 'prevention', 'program'],
    status: 'approved',
    updatedAt: '2026-03-02',
    updatedBy: 'u-luis',
    approvedBy: 'u-claudette',
    approvedAt: '2026-03-04',
  },
  {
    id: 'f-parents',
    category: 'program',
    title: 'Parent Connect circles (pilot)',
    content:
      'A pilot Parent Connect circle meets twice a month so caregivers can share strategies for supporting children through anxiety and grief.',
    tags: ['parents', 'caregivers', 'support-groups', 'families', 'program'],
    status: 'pending',
    updatedAt: '2026-10-28',
    updatedBy: 'u-luis',
  },
  {
    id: 'f-beneficiaries',
    category: 'beneficiaries',
    title: 'Who we serve',
    content:
      'In the 2025–26 school year Tidepath reached 1,340 students through school workshops, 186 youth in mentoring matches, and 212 families in counseling. 81% of families we serve earn below 200% of the federal poverty level, and 58% speak Spanish or Haitian Creole at home.',
    tags: ['beneficiaries', 'demographics', 'youth', 'families', 'population', 'bilingual'],
    status: 'approved',
    source: 'Program enrollment records, June 2026',
    updatedAt: '2026-07-01',
    updatedBy: 'u-luis',
    approvedBy: 'u-claudette',
    approvedAt: '2026-07-02',
  },
  {
    id: 'f-need',
    category: 'beneficiaries',
    title: 'Community need',
    content:
      'In our 2025 survey of partner schools, 2 in 5 middle-school students reported feeling persistently sad or hopeless. School counselors reported waits of up to 10 weeks for family therapy.',
    tags: ['need', 'mental-health', 'schools', 'statistics', 'population'],
    status: 'approved',
    source: 'Tidepath partner-school survey, 2025',
    updatedAt: '2026-03-10',
    updatedBy: 'u-claudette',
    approvedBy: 'u-claudette',
    approvedAt: '2026-03-10',
  },
  {
    id: 'f-outcome-mentoring',
    category: 'outcome',
    title: 'Mentoring outcomes',
    content: 'Of youth matched for a full year, 92% stayed enrolled in school and 74% improved their school attendance.',
    tags: ['outcomes', 'mentoring', 'results', 'impact', 'evaluation'],
    status: 'approved',
    source: '2025–26 program evaluation',
    updatedAt: '2026-06-20',
    updatedBy: 'u-luis',
    approvedBy: 'u-claudette',
    approvedAt: '2026-06-21',
  },
  {
    id: 'f-outcome-counseling',
    category: 'outcome',
    title: 'Counseling outcomes',
    content:
      'Families who completed counseling reported a 38% average drop in household conflict, and 89% said they knew where to turn for help afterward.',
    tags: ['outcomes', 'counseling', 'families', 'results', 'impact'],
    status: 'approved',
    source: '2025–26 program evaluation',
    updatedAt: '2026-06-20',
    updatedBy: 'u-luis',
    approvedBy: 'u-claudette',
    approvedAt: '2026-06-21',
  },
  {
    id: 'f-outcome-workshops',
    category: 'outcome',
    title: 'Workshop outcomes',
    content: 'After the Safe & Strong series, 86% of students could name a trusted adult to go to for help, up from 61% before it began.',
    tags: ['outcomes', 'workshops', 'safety', 'mental-health', 'results'],
    status: 'approved',
    source: '2025–26 pre/post student surveys',
    updatedAt: '2026-06-20',
    updatedBy: 'u-luis',
    approvedBy: 'u-claudette',
    approvedAt: '2026-06-21',
  },
  {
    id: 'f-evaluation',
    category: 'outcome',
    title: 'How we evaluate',
    content:
      'An external evaluator reviews every program each year. Each workshop series uses pre- and post-surveys, and partner schools share attendance data every quarter.',
    tags: ['evaluation', 'outcomes', 'data'],
    status: 'approved',
    updatedAt: '2026-06-20',
    updatedBy: 'u-luis',
    approvedBy: 'u-claudette',
    approvedAt: '2026-06-21',
  },
  {
    id: 'f-capacity',
    category: 'organization',
    title: 'Staff and volunteers',
    content: 'Tidepath has 14 staff, including 6 licensed family therapists, and more than 160 trained volunteer mentors.',
    tags: ['volunteers', 'capacity', 'organization', 'staff'],
    status: 'approved',
    updatedAt: '2026-06-20',
    updatedBy: 'u-luis',
    approvedBy: 'u-claudette',
    approvedAt: '2026-06-21',
  },
  {
    id: 'f-budget',
    category: 'finance',
    title: 'Organizational budget',
    content: "Tidepath's annual budget is $1.6 million, and 83% of expenses go directly to programs.",
    tags: ['budget', 'finance', 'sustainability', 'capacity'],
    status: 'approved',
    source: 'FY2025 audited financials',
    updatedAt: '2026-09-01',
    updatedBy: 'u-denise',
    approvedBy: 'u-claudette',
    approvedAt: '2026-09-02',
  },
  {
    id: 'f-sustain',
    category: 'finance',
    title: 'Funding mix',
    content:
      'About a dozen foundation and government grants provide 72% of revenue, with the rest from individual donors (18%) and an annual gala (10%).',
    tags: ['sustainability', 'finance', 'revenue', 'funding'],
    status: 'draft',
    updatedAt: '2026-11-02',
    updatedBy: 'u-denise',
  },
]

const q = (id: string, prompt: string, wordLimit: number): Grant['questions'][number] => ({
  id,
  prompt,
  wordLimit,
  answer: '',
  citations: [],
  status: 'empty',
  missing: [],
})

const grants: Grant[] = [
  {
    id: 'g-anchor',
    name: 'Anchor Mentors 2026',
    funder: 'Biscayne Youth Fund',
    amount: 96000,
    stage: 'awarded',
    cover: 0,
    ownerId: 'u-claudette',
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    allowSplit: true,
    setupConfirmedAt: '2026-01-08',
    // From the rule below: moving more than 10% of a category to another needs written approval.
    rebudgetThresholdPct: 10,
    deadlines: [
      { id: 'd1', label: 'Mid-year narrative report', date: '2026-07-31', kind: 'report', done: true },
      { id: 'd2', label: 'Final narrative + financial report', date: '2027-01-31', kind: 'report' },
    ],
    rules: [
      'Funder year runs January 1 – December 31.',
      'Indirect costs capped at 10% of the award.',
      'No equipment purchases.',
      'Moving more than 10% of a category to another needs written approval.',
    ],
    categories: [
      { id: 'c1', name: 'Mentor Coordinator', budget: 54000 },
      { id: 'c2', name: 'Mentor Training', budget: 12000 },
      { id: 'c3', name: 'Youth Activities', budget: 15000 },
      { id: 'c4', name: 'Evaluation', budget: 6000 },
      { id: 'c5', name: 'Indirect', budget: 9000 },
    ],
    questions: [
      {
        id: 'q1',
        prompt: 'Describe your organization and its mission.',
        wordLimit: 150,
        answer:
          'Tidepath Family Alliance helps children and teens in Miami-Dade County and their families build safe, connected, and resilient lives through mentoring, family counseling, and safety and mental health workshops in schools. Founded in 2011 by a school social worker and a group of parents, Tidepath began as a weekend mentoring club and now runs programs in 14 public schools and two family centers.',
        citations: ['f-mission', 'f-history'],
        status: 'approved',
        missing: [],
        updatedAt: '2025-10-02',
      },
    ],
  },
  {
    id: 'g-counseling',
    name: 'Family Counseling Access',
    funder: 'South Florida Family Futures Council',
    amount: 110000,
    stage: 'reporting',
    cover: 2,
    ownerId: 'u-claudette',
    periodStart: '2025-10-01',
    periodEnd: '2026-09-30',
    allowSplit: false,
    setupConfirmedAt: '2025-10-06',
    deadlines: [{ id: 'd3', label: 'Annual report', date: '2026-11-30', kind: 'report' }],
    rules: [
      'Funder year runs October 1 – September 30.',
      'Services must be delivered in Miami-Dade County.',
      'Costs may not be shared with other grants.',
      'Quarterly expenditure reports required.',
    ],
    categories: [
      { id: 'c1', name: 'Counselors', budget: 78000 },
      { id: 'c2', name: 'Clinical Supervision', budget: 12000 },
      { id: 'c3', name: 'Interpretation Services', budget: 9000 },
      { id: 'c4', name: 'Family Support', budget: 11000 },
    ],
    questions: [],
  },
  {
    id: 'g-safe',
    name: 'Safe & Strong School Workshops',
    funder: 'State Youth Safety Grants Office',
    amount: 72000,
    stage: 'awarded',
    cover: 5,
    ownerId: 'u-luis',
    periodStart: '2026-07-01',
    periodEnd: '2027-06-30',
    allowSplit: true,
    setupConfirmedAt: '2026-07-02',
    deadlines: [
      { id: 'd4', label: 'Q2 expenditure report', date: '2027-01-15', kind: 'report' },
      { id: 'd5', label: 'Final report', date: '2027-08-15', kind: 'report' },
    ],
    rules: ['Funder year runs July 1 – June 30.', 'Indirect costs capped at 10% of the award.', 'Quarterly expenditure reports required.'],
    categories: [
      { id: 'c1', name: 'Workshop Facilitators', budget: 42000 },
      { id: 'c2', name: 'Curriculum & Materials', budget: 12000 },
      { id: 'c3', name: 'Travel', budget: 6000 },
      { id: 'c4', name: 'Evaluation', budget: 6000 },
      { id: 'c5', name: 'Indirect', budget: 6000 },
    ],
    questions: [],
  },
  {
    id: 'g-familynights',
    name: 'Family Nights 2026',
    funder: 'Keys Neighborhood Fund',
    amount: 12000,
    stage: 'awarded',
    cover: 1,
    ownerId: 'u-luis',
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    allowSplit: false,
    setupConfirmedAt: '2026-01-12',
    deadlines: [{ id: 'd12', label: 'Final report', date: '2027-01-31', kind: 'report' }],
    rules: ['Funder year runs January 1 – December 31.', 'Food and venue costs count as Family Events.'],
    categories: [
      { id: 'c1', name: 'Family Events', budget: 5000 },
      { id: 'c2', name: 'Facilitator Stipends', budget: 7000 },
    ],
    questions: [],
  },
  {
    // Just awarded; budget and period not confirmed yet, so it shows "Needs setup" until the award letter is
    // entered. Its funder year (October) comes from the letter, so it isn't set here.
    id: 'g-family-wellness',
    name: 'Family Wellness Partnership',
    funder: 'Harborlight Community Trust',
    amount: 60000,
    stage: 'awarded',
    cover: 2,
    ownerId: 'u-claudette',
    periodStart: '2026-10-01',
    periodEnd: '2027-09-30',
    allowSplit: false,
    deadlines: [{ id: 'd13', label: 'Q1 expenditure report', date: '2027-01-31', kind: 'report' }],
    rules: ['Funder year runs October 1 – September 30.'],
    categories: [],
    questions: [],
  },
  {
    id: 'g-wellness',
    name: 'Youth Mental Health Partnership',
    funder: 'Coral Coast Health Foundation',
    amount: 150000,
    stage: 'drafting',
    cover: 3,
    ownerId: 'u-claudette',
    periodStart: '2027-07-01',
    periodEnd: '2029-06-30',
    allowSplit: false,
    deadlines: [{ id: 'd6', label: 'Application due', date: '2026-12-04', kind: 'application' }],
    rules: ['Funder year runs July 1 – June 30.', 'Indirect costs are not allowed.', 'Answers over the word limit are not read.'],
    categories: [
      { id: 'c1', name: 'Counselors', budget: 90000 },
      { id: 'c2', name: 'Workshop Facilitators', budget: 30000 },
      { id: 'c3', name: 'Training', budget: 15000 },
      { id: 'c4', name: 'Evaluation', budget: 15000 },
    ],
    questions: [
      q('q1', 'Tell us about your organization and its mission.', 250),
      q('q2', 'What need will this project address? Include data on the children and families you serve.', 250),
      q('q3', 'Describe the proposed program in detail: the services, who delivers them, how often, and how families are reached.', 1000),
      q('q4', 'What outcomes do you expect, and how will you measure them?', 500),
      q('q5', 'How will you sustain this work after the grant ends?', 250),
    ],
  },
  {
    id: 'g-parents',
    name: 'Parent Connect Circles',
    funder: 'Palmetto Family Foundation',
    amount: 40000,
    stage: 'prospect',
    cover: 1,
    ownerId: 'u-luis',
    periodStart: '2027-01-01',
    periodEnd: '2027-12-31',
    allowSplit: false,
    deadlines: [{ id: 'd7', label: 'Letter of inquiry due', date: '2026-12-15', kind: 'application' }],
    rules: [],
    categories: [],
    questions: [q('q1', 'Briefly describe the support parents and caregivers in your community need.', 250)],
  },
  {
    id: 'g-haven',
    name: 'After-School Safe Haven',
    funder: 'Seaside Community Foundation',
    amount: 60000,
    stage: 'submitted',
    cover: 4,
    ownerId: 'u-claudette',
    periodStart: '2027-01-01',
    periodEnd: '2027-12-31',
    allowSplit: false,
    deadlines: [
      { id: 'd8', label: 'Application due', date: '2026-10-15', kind: 'application', done: true },
      { id: 'd9', label: 'Decision expected', date: '2027-01-15', kind: 'other' },
    ],
    rules: ['Funder year runs January 1 – December 31.'],
    categories: [],
    questions: [
      {
        id: 'q1',
        prompt: 'Describe your organization.',
        wordLimit: 100,
        answer:
          'Founded in 2011 by a school social worker and a group of parents, Tidepath began as a weekend mentoring club and now runs programs in 14 public schools and two family centers.',
        citations: ['f-history'],
        status: 'approved',
        missing: [],
        updatedAt: '2026-10-10',
      },
    ],
  },
  {
    id: 'g-camp',
    name: 'Summer Mentoring Camp 2025',
    funder: 'Biscayne Youth Fund',
    amount: 25000,
    stage: 'closed',
    cover: 4,
    ownerId: 'u-luis',
    periodStart: '2025-05-01',
    periodEnd: '2025-09-30',
    allowSplit: false,
    setupConfirmedAt: '2025-05-05',
    deadlines: [{ id: 'd10', label: 'Final report', date: '2025-10-31', kind: 'report', done: true }],
    rules: [],
    categories: [
      { id: 'c1', name: 'Camp Staff', budget: 15000 },
      { id: 'c2', name: 'Activities', budget: 10000 },
    ],
    questions: [],
  },
  {
    id: 'g-violence',
    name: 'Youth Violence Prevention Initiative',
    funder: 'Metro Safe Neighborhoods Fund',
    amount: 200000,
    stage: 'declined',
    cover: 3,
    ownerId: 'u-claudette',
    periodStart: '2026-10-01',
    periodEnd: '2027-09-30',
    allowSplit: false,
    deadlines: [{ id: 'd11', label: 'Application due', date: '2026-05-01', kind: 'application', done: true }],
    rules: [],
    categories: [],
    questions: [],
  },
]

// Sample QuickBooks-style ledger lines. A few are deliberately problematic so the compliance checks have
// something to show. QuickBooks only knows Tidepath's own (calendar) year; each grant is checked in its own.
const tx = (
  id: string,
  date: string,
  vendor: string,
  description: string,
  account: string,
  amount: number,
  allocations: Transaction['allocations'] = [],
  reviewed = true,
): Transaction => ({ id, date, vendor, description, account, amount, allocations, reviewed, source: 'quickbooks-sample' })

const A = 'g-anchor'
const C = 'g-counseling'
const W = 'g-safe'
const N = 'g-familynights'
const S = 'g-camp'
/** Allocation by category name: the grant's category id, or an unmatched name (the planted unauthorized charges). */
const al = (grantId: string, category: string, amount: number): Allocation => allocationFor(grants.find((g) => g.id === grantId)!, category, amount)
const months = (from: string, count: number) => {
  const [y, m] = from.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const mm = ((m - 1 + i) % 12) + 1
    const yy = y + Math.floor((m - 1 + i) / 12)
    return `${yy}-${String(mm).padStart(2, '0')}`
  })
}

const transactions: Transaction[] = [
  // Anchor Mentors 2026 (funder year Jan–Dec 2026)
  ...months('2026-01', 10).map((ym, i) =>
    tx(`t-a-pay-${ym}`, `${ym}-28`, 'Payroll', `Mentor coordinator salary – ${ym}`, '6000 Salaries', 4500, [al(A, 'Mentor Coordinator', 4500)], i < 9),
  ),
  tx('t-a1', '2026-01-20', 'Bayside Outings', 'Mentor–mentee kickoff field day', '6600 Activities', 4800, [al(A, 'Youth Activities', 4800)]),
  tx('t-a2', '2026-04-11', 'Sunline Charter Bus', 'Group outing transportation', '6600 Activities', 3900, [al(A, 'Youth Activities', 3900)]),
  tx('t-a3', '2026-07-18', 'Bayside Outings', 'Summer mentor–mentee outing', '6600 Activities', 3700, [al(A, 'Youth Activities', 3700)]),
  tx('t-a4', '2026-09-26', 'Harbor Park Pavilions', 'Fall family picnic', '6600 Activities', 3200, [al(A, 'Youth Activities', 3200)], false),
  tx('t-a5', '2026-02-07', 'Coastal Youth Training Institute', 'Mentor screening and training – spring cohort', '6500 Training', 5600, [al(A, 'Mentor Training', 5600)]),
  tx('t-a6', '2026-08-15', 'Coastal Youth Training Institute', 'Mentor training – fall cohort', '6500 Training', 5200, [al(A, 'Mentor Training', 5200)]),
  tx('t-a7', '2026-06-30', 'Keystone Evaluation Group', 'Mid-year mentoring evaluation', '6700 Contract Services', 3000, [al(A, 'Evaluation', 3000)]),
  tx('t-a8', '2026-10-05', 'Brightway Electronics', 'Laptops for the mentoring center', '6800 Equipment', 2400, [al(A, 'Equipment', 2400)], false),
  tx('t-a9', '2026-04-30', 'Tidepath Family Alliance', 'Q1 indirect allocation', '7900 Indirect', 2250, [al(A, 'Indirect', 2250)]),
  tx('t-a10', '2026-07-31', 'Tidepath Family Alliance', 'Q2 indirect allocation', '7900 Indirect', 2250, [al(A, 'Indirect', 2250)]),
  tx('t-a11', '2025-12-17', 'Bayside Outings', 'Holiday mentoring event deposit', '6600 Activities', 1100, [al(A, 'Youth Activities', 1100)], false),

  // Family Counseling Access (funder year Oct 2025 – Sep 2026)
  ...months('2025-10', 11).map((ym) =>
    tx(`t-c-pay-${ym}`, `${ym}-25`, 'Payroll', `Family therapists – ${ym}`, '6000 Salaries', 6500, [al(C, 'Counselors', 6500)]),
  ),
  ...months('2025-10', 11).map((ym) =>
    tx(`t-c-sup-${ym}`, `${ym}-26`, 'Dr. Renata Alves, LMFT', `Clinical supervision – ${ym}`, '6700 Contract Services', 900, [al(C, 'Clinical Supervision', 900)]),
  ),
  tx('t-c1', '2025-12-09', 'Lingua Bridge Interpreters', 'Haitian Creole interpretation – Q1', '6700 Contract Services', 2600, [al(C, 'Interpretation Services', 2600)]),
  tx('t-c2', '2026-05-12', 'Lingua Bridge Interpreters', 'Haitian Creole interpretation – Q3', '6700 Contract Services', 2600, [al(C, 'Interpretation Services', 2600)]),
  tx('t-c3', '2025-11-20', 'Family Pantry Partners', 'Emergency grocery cards for families', '6900 Client Support', 2400, [al(C, 'Family Support', 2400)]),
  tx('t-c4', '2026-02-14', 'Metro Transit', 'Bus passes for counseling clients', '6900 Client Support', 1850, [al(C, 'Family Support', 1850)]),
  tx('t-c5', '2026-06-03', 'Family Pantry Partners', 'Summer grocery cards', '6900 Client Support', 2100, [al(C, 'Family Support', 2100)]),
  tx('t-c6', '2026-06-24', 'Family Pantry Partners', 'Refund – unused summer grocery cards', '6900 Client Support', -150, [al(C, 'Family Support', -150)]),

  // Family Nights 2026 (funder year Jan–Dec 2026): Family Events ends $300 over its $5,000 budget
  tx('t-n1', '2026-02-20', 'Harbor Park Pavilions', 'Family night venue – February', '6600 Activities', 1800, [al(N, 'Family Events', 1800)]),
  tx('t-n2', '2026-05-15', 'Sabor Caribeño Catering', 'Family night dinner – May', '6900 Client Support', 1900, [al(N, 'Family Events', 1900)]),
  tx('t-n3', '2026-08-21', 'Harbor Park Pavilions', 'Family night venue and supplies – August', '6600 Activities', 1600, [al(N, 'Family Events', 1600)], false),
  ...['2026-02', '2026-05', '2026-08'].map((ym) =>
    tx(`t-n-fac-${ym}`, `${ym}-22`, 'Payroll', `Family night facilitator stipends – ${ym}`, '6000 Salaries', 1200, [al(N, 'Facilitator Stipends', 1200)]),
  ),

  // Safe & Strong School Workshops (funder year Jul 2026 – Jun 2027)
  ...months('2026-07', 4).map((ym, i) =>
    tx(`t-w-pay-${ym}`, `${ym}-28`, 'Payroll', `Workshop facilitators – ${ym}`, '6000 Salaries', 3500, [al(W, 'Workshop Facilitators', 3500)], i < 3),
  ),
  tx('t-w1', '2026-08-04', 'Brightpath Curriculum Co.', 'Safe & Strong student workbooks', '6400 Program Supplies', 4800, [al(W, 'Curriculum & Materials', 4800)]),
  tx('t-w2', '2026-09-18', 'Mileage reimbursement', 'Facilitator travel to partner schools – Sep', '6600 Travel', 650, [al(W, 'Travel', 650)]),
  tx('t-w3', '2026-10-16', 'Mileage reimbursement', 'Facilitator travel to partner schools – Oct', '6600 Travel', 640, [al(W, 'Travel', 640)], false),
  tx('t-w4', '2026-09-30', 'Tidepath Family Alliance', 'Q1 indirect allocation', '7900 Indirect', 1500, [al(W, 'Indirect', 1500)]),

  // Summer Mentoring Camp 2025 (closed, May–Sep 2025): nearly all of the $25,000 spent; final report submitted
  ...months('2025-05', 5).map((ym) =>
    tx(`t-s-pay-${ym}`, `${ym}-28`, 'Payroll', `Camp counselors – ${ym}`, '6000 Salaries', 3000, [al(S, 'Camp Staff', 3000)]),
  ),
  tx('t-s1', '2025-06-20', 'Bayside Outings', 'Camp field day – June', '6600 Activities', 2400, [al(S, 'Activities', 2400)]),
  tx('t-s2', '2025-07-15', 'Bayside Outings', 'Beach cleanup and picnic', '6600 Activities', 3100, [al(S, 'Activities', 3100)]),
  tx('t-s3', '2025-07-25', 'Sunline Charter Bus', 'Camp trip to the science museum', '6600 Activities', 1700, [al(S, 'Activities', 1700)]),
  tx('t-s4', '2025-08-08', 'Bayside Outings', 'End-of-camp celebration', '6600 Activities', 2650, [al(S, 'Activities', 2650)]),

  // Shared or not yet assigned to a grant
  tx('t-u1', '2026-10-14', 'FPL Utilities', 'Electricity – North family center', '7100 Occupancy', 820, [], false),
  tx('t-u2', '2026-10-20', 'SimplePractice', 'Telehealth and records software', '7200 Software', 360, [], false),
  tx('t-u3', '2026-10-24', 'Office Depot', 'Printer toner, paper', '6400 Program Supplies', 410, [], false),
  tx('t-u4', '2026-11-02', 'Coastal Youth Training Institute', 'Winter mentor training deposit', '6500 Training', 1500, [], false),
]

export const seedState: AppState = {
  org: { id: 'org-tidepath', name: 'Tidepath Family Alliance', ein: '00-0000000', fiscalYearStartMonth: 1 },
  users: [
    { id: 'u-claudette', name: 'Claudette Pierre', role: 'director', title: 'Executive Director', initials: 'CP' },
    { id: 'u-denise', name: 'Denise Carter', role: 'finance', title: 'Bookkeeper (part-time)', initials: 'DC' },
    { id: 'u-luis', name: 'Luis Ortega', role: 'program', title: 'Program Manager', initials: 'LO' },
  ],
  currentUserId: 'u-claudette',
  facts,
  documents: [
    { id: 'p1', name: 'Anchor Mentors – application', kind: 'application', funder: 'Biscayne Youth Fund', year: 2025, outcome: 'awarded' },
    { id: 'p2', name: 'Family Counseling Access – application', kind: 'application', funder: 'South Florida Family Futures Council', year: 2025, outcome: 'awarded' },
    { id: 'p3', name: 'Summer Mentoring Camp – final report', kind: 'report', funder: 'Biscayne Youth Fund', year: 2025 },
    { id: 'p4', name: 'Youth Violence Prevention – application', kind: 'application', funder: 'Metro Safe Neighborhoods Fund', year: 2026, outcome: 'declined' },
  ],
  grants,
  transactions,
}
