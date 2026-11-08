import { AWARD_LETTER_INSTRUCTIONS, AWARD_LETTER_SCHEMA, parseAwardLetter, type ParsedAwardLetter } from '@grantit/shared/award-letter'
import { activeProvider, providerInfo, type AiProvider } from './ai-settings'

const MAX_BYTES = 10 * 1024 * 1024
const TIMEOUT_MS = 120_000
const PROMPT = 'Extract the award terms from this letter.'
const SCHEMA = AWARD_LETTER_SCHEMA as unknown as Record<string, unknown>

/** A failure the Setup tab shows as-is; manual entry keeps working. */
export class AwardLetterError extends Error {}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

interface Letter {
  name: string
  base64: string
}

/** Shared wording for HTTP failures, so every provider reads the same in the Setup tab. */
function httpError(name: string, model: string, status: number | undefined, message: string): AwardLetterError {
  if (status === 401 || status === 403) return new AwardLetterError(`${name} rejected the API key. Check it in Settings.`)
  if (status === 404) return new AwardLetterError(`${name} doesn't recognize the model “${model}”. Change it in Settings.`)
  if (status === 429) return new AwardLetterError(`${name} rate limit or quota reached. Try again shortly, or enter the terms by hand.`)
  if (status === 400) return new AwardLetterError(`${name} couldn't process this request: ${message}`)
  if (status) return new AwardLetterError(`${name} error ${status}. Try again, or enter the terms by hand.`)
  return new AwardLetterError(`Couldn’t reach ${name}. Check your connection, or enter the terms by hand.`)
}

async function viaOpenAI(apiKey: string, model: string, letter: Letter): Promise<string> {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: TIMEOUT_MS })
  try {
    const response = await client.responses.create({
      model,
      instructions: AWARD_LETTER_INSTRUCTIONS,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_file', filename: letter.name, file_data: `data:application/pdf;base64,${letter.base64}` },
            { type: 'input_text', text: PROMPT },
          ],
        },
      ],
      text: { format: { type: 'json_schema', name: 'award_letter', strict: true, schema: SCHEMA } },
    })
    return response.output_text
  } catch (e) {
    throw e instanceof OpenAI.APIError ? httpError('OpenAI', model, e.status, e.message) : httpError('OpenAI', model, undefined, '')
  }
}

// Models that accept server-side refusal fallbacks ("default" routes by refusal category on Anthropic's side).
const CLAUDE_FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])

async function viaClaude(apiKey: string, model: string, letter: Letter): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: TIMEOUT_MS })
  let response: Awaited<ReturnType<typeof client.beta.messages.create>>
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system: AWARD_LETTER_INSTRUCTIONS,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: letter.base64 } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      ...(CLAUDE_FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      stream: false,
    })
  } catch (e) {
    throw e instanceof Anthropic.APIError ? httpError('Claude', model, e.status, e.message) : httpError('Claude', model, undefined, '')
  }
  if (response.stop_reason === 'refusal') throw new AwardLetterError('Claude declined to read this letter. Enter the terms by hand.')
  if (response.stop_reason === 'max_tokens') throw new AwardLetterError('Claude’s answer was cut off. Try again, or enter the terms by hand.')
  return response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
}

async function viaGemini(apiKey: string, model: string, letter: Letter): Promise<string> {
  const { GoogleGenAI, ApiError } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: letter.base64 } }, { text: PROMPT }] }],
      config: {
        systemInstruction: AWARD_LETTER_INSTRUCTIONS,
        responseMimeType: 'application/json',
        responseJsonSchema: SCHEMA,
        httpOptions: { timeout: TIMEOUT_MS },
      },
    })
    return response.text ?? ''
  } catch (e) {
    if (!(e instanceof ApiError)) throw httpError('Gemini', model, undefined, '')
    // Gemini answers a bad key with 400 API_KEY_INVALID rather than 401.
    if (e.status === 400 && /API_KEY_INVALID|API key not valid/i.test(e.message)) throw httpError('Gemini', model, 401, e.message)
    throw httpError('Gemini', model, e.status, e.message)
  }
}

const RUNNERS: Record<AiProvider, (apiKey: string, model: string, letter: Letter) => Promise<string>> = {
  openai: viaOpenAI,
  anthropic: viaClaude,
  gemini: viaGemini,
}

/**
 * Send an award letter PDF to the provider chosen in Settings (OpenAI, Claude or Gemini, each with structured output)
 * and validate what comes back. SDKs load on demand so none of them is in the main bundle.
 */
export async function extractAwardLetter(file: File): Promise<ParsedAwardLetter> {
  const { provider, apiKey, model } = activeProvider()
  const { keyLabel } = providerInfo(provider)
  if (!apiKey) throw new AwardLetterError(`Add your ${keyLabel} in Settings to read award letters with AI. You can still fill in the form by hand.`)
  if (file.type && file.type !== 'application/pdf') throw new AwardLetterError('Choose a PDF file.')
  if (file.size > MAX_BYTES) throw new AwardLetterError('That PDF is over 10 MB. Try a smaller file or enter the terms by hand.')

  const letter = { name: file.name || 'award-letter.pdf', base64: toBase64(new Uint8Array(await file.arrayBuffer())) }
  const text = await RUNNERS[provider](apiKey, model, letter)

  const parsed = parseAwardLetter(text)
  const f = parsed.fields
  if (!f.amount && !f.periodStart && !f.periodEnd && !f.funderFiscalYearStartMonth && !f.categories)
    throw new AwardLetterError('The AI couldn’t find award terms in this PDF. Enter them by hand.')
  return parsed
}
