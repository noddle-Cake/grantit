// AI provider, keys and models for award-letter extraction. Kept in this browser's localStorage only, outside the
// app state, so they never land in demo data, exports, or the build (the repo is public; no key is bundled), and
// "Reset demo data" leaves them alone. Requests go straight from the browser to the chosen provider.

export const AI_SETTINGS_KEY = 'grantit:ai-settings:v2'
const LEGACY_KEY = 'grantit:ai-settings:v1' // { apiKey, model } — OpenAI only

export type AiProvider = 'openai' | 'anthropic' | 'gemini'

export const AI_PROVIDERS: { id: AiProvider; label: string; keyLabel: string; keyPlaceholder: string; defaultModel: string }[] = [
  { id: 'anthropic', label: 'Claude', keyLabel: 'Anthropic API key', keyPlaceholder: 'sk-ant-…', defaultModel: 'claude-opus-5-5' },
  { id: 'openai', label: 'OpenAI', keyLabel: 'OpenAI API key', keyPlaceholder: 'sk-…', defaultModel: 'gpt-5.5' },
  { id: 'gemini', label: 'Gemini', keyLabel: 'Gemini API key', keyPlaceholder: 'AIza…', defaultModel: 'gemini-3.5-flash' },
]

export const providerInfo = (p: AiProvider) => AI_PROVIDERS.find((x) => x.id === p)!
export const defaultModel = (p: AiProvider) => providerInfo(p).defaultModel

export interface ProviderSettings {
  apiKey: string
  model: string
}

export interface AiSettings {
  provider: AiProvider
  providers: Record<AiProvider, ProviderSettings>
}

const isProvider = (v: unknown): v is AiProvider => v === 'openai' || v === 'anthropic' || v === 'gemini'
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function normalize(raw: unknown): AiSettings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const saved = (typeof r.providers === 'object' && r.providers !== null ? r.providers : {}) as Record<string, Record<string, unknown> | undefined>
  const providers = Object.fromEntries(
    AI_PROVIDERS.map(({ id, defaultModel: dm }) => [id, { apiKey: str(saved[id]?.apiKey), model: str(saved[id]?.model) || dm }]),
  ) as Record<AiProvider, ProviderSettings>
  return { provider: isProvider(r.provider) ? r.provider : 'anthropic', providers }
}

export function readAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY)
    if (raw) return normalize(JSON.parse(raw))
    // Carry an OpenAI key saved before providers were added.
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? 'null') as { apiKey?: unknown; model?: unknown } | null
    if (legacy && str(legacy.apiKey)) return normalize({ provider: 'openai', providers: { openai: legacy } })
  } catch {
    /* unreadable or blocked storage: defaults */
  }
  return normalize(null)
}

export function writeAiSettings(s: AiSettings) {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(normalize(s)))
  localStorage.removeItem(LEGACY_KEY)
}

/** Forget one provider's key (and model), keeping the others. */
export function clearProviderKey(s: AiSettings, provider: AiProvider): AiSettings {
  const next = normalize({ ...s, providers: { ...s.providers, [provider]: { apiKey: '', model: '' } } })
  writeAiSettings(next)
  return next
}

/** The provider award-letter reading will use, with its key and model. */
export function activeProvider(s: AiSettings = readAiSettings()) {
  return { provider: s.provider, ...s.providers[s.provider] }
}
