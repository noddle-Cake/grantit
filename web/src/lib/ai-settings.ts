// OpenAI key and model for award-letter extraction. Kept in this browser's localStorage only, outside the app
// state, so it never lands in demo data, exports, or the build (the site is public; no key is bundled), and
// "Reset demo data" leaves it alone. Requests go straight from the browser to OpenAI.

export const AI_SETTINGS_KEY = 'grantit:ai-settings:v1'
export const DEFAULT_AI_MODEL = 'gpt-5.5'

export interface AiSettings {
  apiKey: string
  model: string
}

export function readAiSettings(): AiSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) ?? '{}') as Partial<AiSettings>
    return { apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '', model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : DEFAULT_AI_MODEL }
  } catch {
    return { apiKey: '', model: DEFAULT_AI_MODEL }
  }
}

export function writeAiSettings(s: AiSettings) {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify({ apiKey: s.apiKey.trim(), model: s.model.trim() || DEFAULT_AI_MODEL }))
}

export function clearAiSettings() {
  localStorage.removeItem(AI_SETTINGS_KEY)
}
