import { Check, Copy, Download, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Card, Field, Input, Modal, Pill } from '@/components/ui'
import { CALENDAR_PROVIDERS, feedUrl, providerById, type CalendarConnection, type CalendarProvider, type CalendarProviderId } from '@/lib/calendar-connections'
import { useStore } from '@/store'

const syncedLabel = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function ProviderMark({ provider }: { provider: CalendarProvider }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: provider.color }} aria-hidden>
      {provider.name[0]}
    </span>
  )
}

/** The list of calendar apps a team can connect. Connecting is a preview: see lib/calendar-connections.ts. */
export function ConnectedCalendars({ connections, onChange, onExport }: { connections: CalendarConnection[]; onChange: (c: CalendarConnection[]) => void; onExport: () => void }) {
  const { notify } = useStore()
  const [connecting, setConnecting] = useState<CalendarProviderId | null>(null)
  const [syncing, setSyncing] = useState<CalendarProviderId | null>(null)
  const byId = new Map(connections.map((c) => [c.provider, c]))

  const disconnect = (id: CalendarProviderId) => {
    const removed = byId.get(id)!
    onChange(connections.filter((c) => c.provider !== id))
    notify(`Disconnected ${providerById(id).name}`, 'info', { label: 'Undo', run: () => onChange([...connections.filter((c) => c.provider !== id), removed]) })
  }
  const syncNow = (id: CalendarProviderId) => {
    setSyncing(id)
    setTimeout(() => {
      setSyncing(null)
      onChange(connections.map((c) => (c.provider === id ? { ...c, lastSyncedAt: new Date().toISOString() } : c)))
      notify(`${providerById(id).name} is up to date`)
    }, 900)
  }

  return (
    <Card title="Connected calendars" action={<Pill tone="info">Preview</Pill>} padded={false}>
      <p className="px-5 pt-4 text-xs text-slate-3">
        Push deadlines to your team’s calendars so nobody misses a due date. Connections are simulated in this preview and nothing leaves your browser.
      </p>
      <ul className="divide-y divide-line-2">
        {CALENDAR_PROVIDERS.map((p) => {
          const c = byId.get(p.id)
          return (
            <li key={p.id} className="px-5 py-3.5">
              <div className="flex items-center gap-3">
                <ProviderMark provider={p} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate">{p.name}</div>
                  <div className="truncate text-xs text-slate-3">{c ? (c.account ?? 'Subscribed to the deadlines feed') : p.blurb}</div>
                </div>
                {!c && <Button variant="secondary" size="sm" onClick={() => setConnecting(p.id)} aria-label={`Connect ${p.name}`}>Connect</Button>}
              </div>
              {c && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-12 text-xs">
                  <span className="flex items-center gap-1 text-good"><Check size={12} strokeWidth={3} /> Connected</span>
                  {p.method === 'oauth' && <span className="text-slate-3">Synced {syncedLabel(c.lastSyncedAt)}</span>}
                  <span className="ml-auto flex gap-1">
                    {p.method === 'oauth' && (
                      <button type="button" onClick={() => syncNow(p.id)} disabled={syncing === p.id} className="flex items-center gap-1 rounded px-1.5 py-1 font-medium text-link hover:bg-link-soft disabled:opacity-60">
                        <RefreshCw size={12} className={syncing === p.id ? 'animate-spin' : undefined} /> {syncing === p.id ? 'Syncing…' : 'Sync now'}
                      </button>
                    )}
                    <button type="button" onClick={() => disconnect(p.id)} className="rounded px-1.5 py-1 font-medium text-slate-2 hover:bg-canvas-2" aria-label={`Disconnect ${p.name}`}>Disconnect</button>
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="border-t border-line-2 px-5 py-3">
        <button type="button" onClick={onExport} className="flex items-center gap-1.5 text-sm font-medium text-link hover:underline">
          <Download size={14} /> Download an .ics file instead
        </button>
      </div>
      {connecting && (
        <ConnectDialog
          provider={providerById(connecting)}
          onClose={() => setConnecting(null)}
          onExport={onExport}
          onConnect={(conn) => {
            onChange([...connections.filter((x) => x.provider !== conn.provider), conn])
            setConnecting(null)
            notify(`${providerById(conn.provider).name} connected`)
          }}
        />
      )}
    </Card>
  )
}

const FEED_STEPS: Record<string, string[]> = {
  apple: [
    'On a Mac, open Calendar and choose File → New Calendar Subscription.',
    'On iPhone or iPad, go to Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar.',
    'Paste the link and choose iCloud as the location so it shows on all your devices.',
  ],
  ical: [
    'In your calendar app, find Add calendar → From URL (sometimes called Subscribe or Internet calendar).',
    'Paste the link. Most apps refresh subscribed calendars every few hours.',
  ],
}

function ConnectDialog({ provider, onClose, onConnect, onExport }: { provider: CalendarProvider; onClose: () => void; onConnect: (c: CalendarConnection) => void; onExport: () => void }) {
  const { state, me } = useStore()
  const oauth = provider.method === 'oauth'
  const [step, setStep] = useState<'intro' | 'waiting' | 'options'>(oauth ? 'intro' : 'options')
  const domain = state.org.name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'yourorg'
  const [account, setAccount] = useState(`${me.name.split(' ')[0].toLowerCase()}@${domain}.org`)
  const [target, setTarget] = useState<CalendarConnection['target']>('new')
  const [includeOpportunities, setIncludeOpportunities] = useState(true)
  const [showTheirEvents, setShowTheirEvents] = useState(true)
  const [copied, setCopied] = useState(false)
  const url = feedUrl(state.org.name)

  // Stand-in for the provider's sign-in window.
  useEffect(() => {
    if (step !== 'waiting') return
    const t = setTimeout(() => setStep('options'), 1100)
    return () => clearTimeout(t)
  }, [step])

  const finish = () => {
    const now = new Date().toISOString()
    onConnect({
      provider: provider.id,
      account: oauth ? account.trim() || provider.accountHint : undefined,
      target,
      includeOpportunities,
      showTheirEvents: oauth && showTheirEvents,
      connectedAt: now,
      lastSyncedAt: now,
    })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the link is selectable in the field.
    }
  }

  return (
    <Modal open onClose={onClose} label={`Connect ${provider.name}`} width={520}>
      <div className="flex items-center gap-3 border-b border-line-2 px-6 py-4">
        <ProviderMark provider={provider} />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate">Connect {provider.name}</h2>
          <p className="text-xs text-slate-3">{oauth ? 'Two-way sync' : 'Subscribe to a live feed'} · Preview</p>
        </div>
      </div>

      <div className="space-y-4 px-6 py-5 text-sm text-slate-2">
        {step === 'intro' && (
          <>
            <p>You’ll sign in with {provider.name.split(' ')[0]} and allow Grantit to:</p>
            <ul className="space-y-2">
              {[`Add a “${state.org.name} grants” calendar and keep it up to date`, 'Read your events so meetings show next to deadlines', 'Never edit or delete events Grantit didn’t create'].map((t) => (
                <li key={t} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-good" />{t}</li>
              ))}
            </ul>
            <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-slate-3">This is a preview: no sign-in window opens and no account is accessed.</p>
          </>
        )}

        {step === 'waiting' && (
          <div role="status" className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 size={28} className="animate-spin text-link" />
            Waiting for {provider.name.split(' ')[0]} to confirm…
          </div>
        )}

        {step === 'options' && oauth && (
          <>
            <Field label="Signed in as"><Input type="email" value={account} onChange={(e) => setAccount(e.target.value)} placeholder={provider.accountHint} /></Field>
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-[0.8125rem] font-medium text-slate">Put Grantit events on</legend>
              <label className="flex items-start gap-2"><input type="radio" name="target" className="mt-1" checked={target === 'new'} onChange={() => setTarget('new')} /><span><span className="font-medium text-slate">A new “{state.org.name} grants” calendar</span><span className="block text-xs text-slate-3">Recommended: easy to share with your board or hide in one click.</span></span></label>
              <label className="flex items-start gap-2"><input type="radio" name="target" className="mt-1" checked={target === 'primary'} onChange={() => setTarget('primary')} /><span className="font-medium text-slate">My main calendar</span></label>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-[0.8125rem] font-medium text-slate">Sync</legend>
              <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked disabled /><span>Application deadlines, reports and grant period ends<span className="block text-xs text-slate-3">With a reminder one week before each deadline.</span></span></label>
              <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={includeOpportunities} onChange={(e) => setIncludeOpportunities(e.target.checked)} /><span>Closing dates of recommended opportunities</span></label>
              <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={showTheirEvents} onChange={(e) => setShowTheirEvents(e.target.checked)} /><span>Show my {provider.name.split(' ')[0]} events in Grantit</span></label>
            </fieldset>
          </>
        )}

        {step === 'options' && !oauth && (
          <>
            <Field label="Subscription link" hint="The live link turns on once your workspace is connected to the Grantit server.">
              <div className="flex gap-2">
                <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                <Button variant="secondary" size="md" onClick={copy} icon={copied ? <Check size={14} /> : <Copy size={14} />} aria-label="Copy subscription link">{copied ? 'Copied' : 'Copy'}</Button>
              </div>
            </Field>
            <ol className="list-decimal space-y-1.5 pl-5">
              {FEED_STEPS[provider.id].map((s) => <li key={s}>{s}</li>)}
            </ol>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={includeOpportunities} onChange={(e) => setIncludeOpportunities(e.target.checked)} /><span>Include closing dates of recommended opportunities</span></label>
            <button type="button" onClick={onExport} className="flex items-center gap-1.5 font-medium text-link hover:underline">
              <Download size={14} /> Or download a one-time .ics file (works today)
            </button>
          </>
        )}
      </div>

      <footer className="flex flex-wrap justify-end gap-2 border-t border-line-2 bg-canvas px-6 py-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {step === 'intro' && <Button icon={<ExternalLink size={14} />} onClick={() => setStep('waiting')}>Continue to {provider.name.split(' ')[0]}</Button>}
        {step === 'options' && <Button onClick={finish}>{oauth ? 'Connect calendar' : 'I’ve subscribed'}</Button>}
      </footer>
    </Modal>
  )
}
