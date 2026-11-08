import { ArrowRight, BookOpenText, CheckCircle2, Compass, FileText, HandCoins, Receipt, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui'

// Marketing landing page: a HubSpot-style top nav, hero and product cards, with Fudi-style
// "for whom" value sections and a numbered "how it works". Public — shown before sign-in.

function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line-2 bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Logo className="h-7" />
        <nav aria-label="Marketing" className="ml-auto hidden items-center gap-6 text-sm text-slate-2 md:flex">
          <a href="#features" className="hover:text-slate">Features</a>
          <a href="#how" className="hover:text-slate">How it works</a>
          <a href="#roles" className="hover:text-slate">Who it's for</a>
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link to="/" className="hidden sm:block">
            <Button variant="ghost" size="sm">Open Grantit</Button>
          </Link>
          <Link to="/">
            <Button size="sm" icon={<ArrowRight size={16} />}>Get started</Button>
          </Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="cover-0 pointer-events-none absolute inset-x-0 top-0 h-72 opacity-20" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-dark">
          <Sparkles size={14} /> Grounded AI for grant teams
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-slate sm:text-5xl">
          Win more grants, without the busywork
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-2 sm:text-lg">
          Grantit gives small nonprofits a verified knowledge base, AI drafting grounded only in your
          approved facts, and grant-by-grant spending tracking in each funder's own reporting period.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/">
            <Button icon={<ArrowRight size={18} />}>Get started free</Button>
          </Link>
          <a href="#how">
            <Button variant="secondary">See how it works</Button>
          </a>
        </div>
        <p className="mt-4 text-xs text-slate-3">No credit card. Explore with demo data in seconds.</p>
      </div>
    </section>
  )
}

const FEATURES = [
  { icon: BookOpenText, title: 'Verified knowledge base', body: 'Store your mission, programs, and measurable outcomes. Staff add, edit, and approve the facts every application draws from.' },
  { icon: FileText, title: 'Grounded AI drafting', body: "Generate answers inside each question's word limit, cited to approved facts. Missing information is flagged, never invented." },
  { icon: Compass, title: 'Find the right funders', body: 'See opportunities recommended from your approved facts, then move prospects through a clear application pipeline.' },
  { icon: Receipt, title: 'Expenditure tracking', body: "Import transactions, assign them to grants and categories, and catch unauthorized or over-budget spending automatically." },
  { icon: HandCoins, title: "Each funder's own period", body: "Budgets, spending, and reports follow each grant's funding period — independent of your fiscal year." },
  { icon: ShieldCheck, title: 'Audit-ready reports', body: 'Organization-wide dashboards, per-grant expenditure reports, and deadline tracking your board can trust.' },
]

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-slate sm:text-3xl">Everything a grant team needs, in one place</h2>
        <p className="mt-3 text-slate-2">From finding funding to proving how you spent it — grounded in facts you approved.</p>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-lg border border-line-2 bg-surface p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-dark">
              <Icon size={22} strokeWidth={1.8} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate">{title}</h3>
            <p className="mt-1.5 text-sm text-slate-2">{body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

const STEPS = [
  { n: 1, title: 'Build your knowledge base', body: 'Capture your mission, programs, and outcomes. Approve the facts you want every application grounded in.' },
  { n: 2, title: 'Draft with grounded AI', body: 'Generate answers cited to approved facts, inside each question’s word limit. Review, edit, and approve.' },
  { n: 3, title: 'Track every dollar', body: 'Import spending, assign it to grants and categories, and get flagged before anything goes over budget.' },
  { n: 4, title: 'Report with confidence', body: "See spending in each funder's reporting period and export the reports your funders ask for." },
]

function HowItWorks() {
  return (
    <section id="how" className="bg-canvas-2/60 py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-slate sm:text-3xl">From blank page to funded, in four steps</h2>
        </div>
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ n, title, body }) => (
            <li key={n} className="rounded-lg border border-line-2 bg-surface p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">{n}</span>
              <h3 className="mt-4 text-base font-semibold text-slate">{title}</h3>
              <p className="mt-1.5 text-sm text-slate-2">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

const ROLES = [
  { title: 'For directors', body: 'Configure grants, draft applications, approve information, and see the whole portfolio at a glance.', points: ['Organization-wide dashboard', 'Application pipeline', 'Deadline tracking'] },
  { title: 'For finance staff', body: 'Review transactions, correct classifications, and keep every grant compliant with its own budget.', points: ['Import transactions', 'Compliance flags', 'Per-grant reports'] },
  { title: 'For program staff', body: 'Contribute and approve the program facts that make applications specific, credible, and true.', points: ['Add program facts', 'Approval workflow', 'Cited in every draft'] },
]

function Roles() {
  return (
    <section id="roles" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-slate sm:text-3xl">Built for how small nonprofits actually work</h2>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {ROLES.map(({ title, body, points }) => (
          <div key={title} className="flex flex-col rounded-lg border border-line-2 bg-surface p-6">
            <h3 className="text-lg font-semibold text-slate">{title}</h3>
            <p className="mt-2 text-sm text-slate-2">{body}</p>
            <ul className="mt-4 space-y-2">
              {points.map((p) => (
                <li key={p} className="flex items-center gap-2 text-sm text-slate">
                  <CheckCircle2 size={16} className="shrink-0 text-good" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function CtaBand() {
  return (
    <section className="relative overflow-hidden bg-obsidian">
      <div className="cover-0 pointer-events-none absolute inset-0 opacity-25" aria-hidden />
      <div className="relative mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Ready to spend less time on paperwork?</h2>
        <p className="mx-auto mt-3 max-w-xl text-rail-text">
          Open Grantit and explore it with a full demo organization — grants, facts, and a ledger already loaded.
        </p>
        <div className="mt-7 flex justify-center">
          <Link to="/">
            <Button icon={<ArrowRight size={18} />}>Get started</Button>
          </Link>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-line-2 bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-3 sm:flex-row sm:px-6">
        <Logo />
        <p>Grant management for small nonprofits.</p>
        <p>© {year} Grantit</p>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-full bg-canvas">
      <a href="#landing-main" className="fixed left-4 top-2 z-[70] -translate-y-24 rounded bg-surface px-4 py-3 text-link shadow focus:translate-y-0">Skip to content</a>
      <TopBar />
      <main id="landing-main">
        <Hero />
        <Features />
        <HowItWorks />
        <Roles />
        <CtaBand />
      </main>
      <Footer />
    </div>
  )
}
