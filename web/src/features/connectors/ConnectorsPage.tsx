import {
  Banknote,
  BellRing,
  CalendarDays,
  Cloud,
  FileSignature,
  KeyRound,
  Plug,
  Search,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Button, Card, Field, Input, Pill, Segmented, StatusPill, type Tone } from '@/components/ui'
import { AI_PROVIDERS, type AiProvider, clearProviderKey, providerInfo, readAiSettings, writeAiSettings } from '@/lib/ai-settings'
import { useStore } from '@/store'

// Connectors are demo-only for now: this screen shows the integrations from docs/connectors.md as
// tiles a nonprofit would wire up, plus the AI drafting provider + API key that the drafter uses.
// Nothing here talks to a real service except the AI key, which is stored in this browser only.

type ConnStatus = 'connected' | 'available' | 'soon'
const STATUS: Record<ConnStatus, { tone: Exclude<Tone, 'neutral' | 'brand'>; label: string; action: string }> = {
  connected: { tone: 'good', label: 'Connected (demo)', action: 'Manage' },
  available: { tone: 'info', label: 'Available', action: 'Connect' },
  soon: { tone: 'warn', label: 'Coming soon', action: 'Connect' },
}

interface Connector {
  id: string
  name: string
  blurb: string
  tier: string
  icon: LucideIcon
  status: ConnStatus
}

// Grouped and prioritized to match docs/connectors.md §2 (connector priority) and the build order (§14).
const GROUPS: { heading: string; summary: string; icon: LucideIcon; items: Connector[] }[] = [
  {
    heading: 'Accounting & bookkeeping',
    summary: 'The ledger behind Manage funds. Pull transactions in, keep Grantit as the compliance view.',
    icon: Wallet,
    items: [
      { id: 'quickbooks', name: 'QuickBooks Online', blurb: 'Sync expenses and bills, map Classes to grants and accounts to budget categories.', tier: 'P0', icon: Banknote, status: 'connected' },
      { id: 'xero', name: 'Xero', blurb: 'Pull transactions with tracking categories mapped to grants.', tier: 'P0', icon: Banknote, status: 'available' },
      { id: 'csv', name: 'CSV import', blurb: 'Universal fallback for Sage, Blackbaud, Aplos, Wave, and any export-only system.', tier: 'P0', icon: Plug, status: 'connected' },
    ],
  },
  {
    heading: 'Grant discovery',
    summary: 'Fill the Find & apply pipeline from public and licensed listing feeds.',
    icon: Search,
    items: [
      { id: 'grants-gov', name: 'Grants.gov', blurb: 'Federal opportunities via the public Search2 API, ranked against your approved facts.', tier: 'P1', icon: Search, status: 'available' },
      { id: 'candid', name: 'Candid / Foundation Directory', blurb: 'Foundation grants from your licensed FDO subscription.', tier: 'P1', icon: Search, status: 'soon' },
      { id: 'instrumentl', name: 'Instrumentl', blurb: 'Aggregated foundation and federal matches.', tier: 'P1', icon: Search, status: 'soon' },
    ],
  },
  {
    heading: 'Documents',
    summary: 'Ingest past applications and source PDFs the knowledge base draws from; file drafts back.',
    icon: Cloud,
    items: [
      { id: 'google-drive', name: 'Google Drive', blurb: 'Ingest PDFs from a folder as pending source documents for review.', tier: 'P1', icon: Cloud, status: 'available' },
      { id: 'sharepoint', name: 'SharePoint / OneDrive', blurb: 'Microsoft 365 document libraries.', tier: 'P1', icon: Cloud, status: 'soon' },
      { id: 'dropbox', name: 'Dropbox', blurb: 'Sync a shared grants folder.', tier: 'P1', icon: Cloud, status: 'soon' },
    ],
  },
  {
    heading: 'Identity & single sign-on',
    summary: 'Let staff sign in with your existing org identity provider.',
    icon: ShieldCheck,
    items: [
      { id: 'google-workspace', name: 'Google Workspace', blurb: 'OIDC sign-in with group-to-role mapping.', tier: 'P2', icon: ShieldCheck, status: 'available' },
      { id: 'entra', name: 'Microsoft Entra ID', blurb: 'Azure AD SSO for Microsoft-grant nonprofits.', tier: 'P2', icon: ShieldCheck, status: 'soon' },
      { id: 'okta', name: 'Okta', blurb: 'SAML 2.0 / OIDC with SCIM deprovisioning.', tier: 'P2', icon: ShieldCheck, status: 'soon' },
    ],
  },
  {
    heading: 'Calendar & notifications',
    summary: 'Get deadlines and compliance flags where your team already works.',
    icon: BellRing,
    items: [
      { id: 'google-calendar', name: 'Google Calendar', blurb: 'Push application and report deadlines as events with reminders.', tier: 'P2', icon: CalendarDays, status: 'available' },
      { id: 'outlook-calendar', name: 'Outlook Calendar', blurb: 'Deadlines to Microsoft 365 calendars.', tier: 'P2', icon: CalendarDays, status: 'soon' },
      { id: 'slack', name: 'Slack', blurb: 'Post when a flag is raised, a draft is ready, or a grant changes stage.', tier: 'P2', icon: BellRing, status: 'available' },
      { id: 'teams', name: 'Microsoft Teams', blurb: 'The same alerts in a Teams channel.', tier: 'P2', icon: BellRing, status: 'soon' },
    ],
  },
  {
    heading: 'CRM & relationships',
    summary: 'Avoid double-entering funders; link grants to a known funder record.',
    icon: Users,
    items: [
      { id: 'salesforce', name: 'Salesforce NPSP', blurb: 'Import funder records and push awarded grants back as gifts.', tier: 'P2', icon: Users, status: 'soon' },
      { id: 'bloomerang', name: 'Bloomerang', blurb: 'Funder and contact sync for small development teams.', tier: 'P2', icon: Users, status: 'soon' },
      { id: 'hubspot', name: 'HubSpot', blurb: 'Map funders to companies and contacts.', tier: 'P2', icon: Users, status: 'soon' },
    ],
  },
  {
    heading: 'Payroll & e-signature',
    summary: 'Allocate personnel cost to grants, and route award letters for signature.',
    icon: FileSignature,
    items: [
      { id: 'gusto', name: 'Gusto', blurb: 'Allocate payroll runs across grants by a time-distribution percentage.', tier: 'P3', icon: Banknote, status: 'soon' },
      { id: 'docusign', name: 'DocuSign', blurb: 'Route award letters and subawards for signature, then file the signed PDF.', tier: 'P3', icon: FileSignature, status: 'soon' },
    ],
  },
]

function ConnectorTile({ c, onConnect }: { c: Connector; onConnect: (c: Connector) => void }) {
  const s = STATUS[c.status]
  const Icon = c.icon
  return (
    <div className="flex flex-col rounded-lg border border-line-2 bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas-2 text-slate-2">
          <Icon size={20} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-slate">{c.name}</h4>
            <Pill tone="neutral" className="text-[0.625rem]">{c.tier}</Pill>
          </div>
          <StatusPill tone={s.tone}>{s.label}</StatusPill>
        </div>
      </div>
      <p className="mt-3 flex-1 text-xs text-slate-2">{c.blurb}</p>
      <div className="mt-4">
        <Button variant={c.status === 'connected' ? 'secondary' : 'primary'} size="sm" onClick={() => onConnect(c)}>
          {s.action}
        </Button>
      </div>
    </div>
  )
}

function AiProviderCard() {
  const { notify } = useStore()
  const [ai, setAi] = useState(readAiSettings)
  const [showKey, setShowKey] = useState(false)
  const info = providerInfo(ai.provider)
  const current = ai.providers[ai.provider]
  const setProvider = (patch: Partial<typeof current>) => setAi({ ...ai, providers: { ...ai.providers, [ai.provider]: { ...current, ...patch } } })
  return (
    <Card title="AI drafting provider">
      <p className="text-sm text-slate-2">
        Add your own API key so Claude, OpenAI or Gemini drafts application answers from your approved facts and PDFs —
        quoting a source for every sentence — and reads award letters to pre-fill a grant's amount, period and budget.
        Without a key, drafts come from the built-in drafter. Keys are stored only in this browser, sent directly to the
        provider, and left untouched by Reset.
      </p>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          writeAiSettings(ai)
          setAi(readAiSettings())
          notify(current.apiKey.trim() ? `AI key saved in this browser · using ${info.label}` : `Saved; add a ${info.keyLabel} to use ${info.label}`)
        }}
      >
        <div className="sm:col-span-2">
          <Segmented<AiProvider>
            label="AI provider"
            value={ai.provider}
            onChange={(provider) => { setAi({ ...ai, provider }); setShowKey(false) }}
            options={AI_PROVIDERS.map((p) => ({ id: p.id, label: <>{p.label}{ai.providers[p.id].apiKey && <span aria-label="key saved" className="text-good">•</span>}</> }))}
          />
        </div>
        <Field label={info.keyLabel} className="sm:col-span-2" hint={<button type="button" className="text-link hover:underline" onClick={() => setShowKey((v) => !v)}>{showKey ? 'Hide key' : 'Show key'}</button>}>
          <Input type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} placeholder={info.keyPlaceholder} value={current.apiKey} onChange={(e) => setProvider({ apiKey: e.target.value })} />
        </Field>
        <Field label="Model" hint={`Default: ${info.defaultModel}. Needs PDF input and structured outputs.`}>
          <Input spellCheck={false} value={current.model} onChange={(e) => setProvider({ model: e.target.value })} />
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit" icon={<KeyRound size={15} />}>Save key</Button>
          <Button type="button" variant="secondary" onClick={() => { setAi(clearProviderKey(ai, ai.provider)); notify(`${info.label} key removed from this browser`, 'info') }}>Remove key</Button>
        </div>
      </form>
    </Card>
  )
}

export default function Connectors() {
  const { notify } = useStore()
  const onConnect = (c: Connector) =>
    notify(
      c.status === 'connected'
        ? `${c.name} is connected in this demo`
        : `${c.name} is a demo connector — real sync is on the roadmap`,
      'info',
    )

  return (
    <>
      <p className="mb-4 text-sm text-slate-2">Wire Grantit into the tools your nonprofit already runs. Connectors are demo-only for now; add your AI drafting key below.</p>
      <div className="space-y-8">
        <AiProviderCard />

        {GROUPS.map((g) => {
          const Icon = g.icon
          return (
            <section key={g.heading} aria-label={g.heading}>
              <div className="mb-3 flex items-start gap-2.5">
                <Icon size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-slate-3" />
                <div>
                  <h2 className="text-[0.9375rem] font-semibold text-slate">{g.heading}</h2>
                  <p className="text-xs text-slate-2">{g.summary}</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((c) => (
                  <ConnectorTile key={c.id} c={c} onConnect={onConnect} />
                ))}
              </div>
            </section>
          )
        })}

        <p className="text-xs text-slate-3">
          Connector priorities and sync details are documented in docs/connectors.md. Tiles here are illustrative;
          only the AI provider key is live and stored in this browser.
        </p>
      </div>
    </>
  )
}
