// One structured-output request to the provider chosen in Connectors (Claude, OpenAI or Gemini), optionally with a
// PDF attached. Requests go straight from the browser with the key saved in this browser. SDKs load on demand so
// none of them is in the main bundle.
import { activeProvider, type AiProvider } from './ai-settings'

const TIMEOUT_MS = 120_000

/** A failure shown to the user as-is. */
export class AiError extends Error {}

export interface AiJsonRequest {
  system: string
  prompt: string
  /** JSON schema of the answer (strict: every property required, no additional properties). */
  schema: Record<string, unknown>
  schemaName: string
  pdf?: { name: string; base64: string }
  /** What the user can do instead, ending the error messages: "enter the terms by hand". */
  fallback: string
  /** Shown when Claude refuses. */
  refusal: string
}

/** Shared wording for HTTP failures, so every provider reads the same. */
function httpError(name: string, model: string, status: number | undefined, message: string, fallback: string): AiError {
  if (status === 401 || status === 403) return new AiError(`${name} rejected the API key. Check it in Connectors.`)
  if (status === 404) return new AiError(`${name} doesn't recognize the model “${model}”. Change it in Connectors.`)
  if (status === 429) return new AiError(`${name} rate limit or quota reached. Try again shortly, or ${fallback}.`)
  if (status === 400) return new AiError(`${name} couldn't process this request: ${message}`)
  if (status) return new AiError(`${name} error ${status}. Try again, or ${fallback}.`)
  return new AiError(`Couldn’t reach ${name}. Check your connection, or ${fallback}.`)
}

type Runner = (apiKey: string, model: string, req: AiJsonRequest) => Promise<string>

const viaOpenAI: Runner = async (apiKey, model, req) => {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: TIMEOUT_MS })
  try {
    const response = await client.responses.create({
      model,
      instructions: req.system,
      input: [
        {
          role: 'user',
          content: [
            ...(req.pdf ? [{ type: 'input_file' as const, filename: req.pdf.name, file_data: `data:application/pdf;base64,${req.pdf.base64}` }] : []),
            { type: 'input_text' as const, text: req.prompt },
          ],
        },
      ],
      text: { format: { type: 'json_schema', name: req.schemaName, strict: true, schema: req.schema } },
    })
    return response.output_text
  } catch (e) {
    throw e instanceof OpenAI.APIError ? httpError('OpenAI', model, e.status, e.message, req.fallback) : httpError('OpenAI', model, undefined, '', req.fallback)
  }
}

// Models that accept server-side refusal fallbacks ("default" routes by refusal category on Anthropic's side).
const CLAUDE_FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])

const viaClaude: Runner = async (apiKey, model, req) => {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: TIMEOUT_MS })
  let response: Awaited<ReturnType<typeof client.beta.messages.create>>
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system: req.system,
      messages: [
        {
          role: 'user',
          content: [
            ...(req.pdf ? [{ type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: req.pdf.base64 } }] : []),
            { type: 'text' as const, text: req.prompt },
          ],
        },
      ],
      output_config: { format: { type: 'json_schema', schema: req.schema } },
      ...(CLAUDE_FALLBACK_MODELS.has(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      stream: false,
    })
  } catch (e) {
    throw e instanceof Anthropic.APIError ? httpError('Claude', model, e.status, e.message, req.fallback) : httpError('Claude', model, undefined, '', req.fallback)
  }
  if (response.stop_reason === 'refusal') throw new AiError(req.refusal)
  if (response.stop_reason === 'max_tokens') throw new AiError(`Claude’s answer was cut off. Try again, or ${req.fallback}.`)
  return response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
}

const viaGemini: Runner = async (apiKey, model, req) => {
  const { GoogleGenAI, ApiError } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey })
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [...(req.pdf ? [{ inlineData: { mimeType: 'application/pdf', data: req.pdf.base64 } }] : []), { text: req.prompt }] }],
      config: {
        systemInstruction: req.system,
        responseMimeType: 'application/json',
        responseJsonSchema: req.schema,
        httpOptions: { timeout: TIMEOUT_MS },
      },
    })
    return response.text ?? ''
  } catch (e) {
    if (!(e instanceof ApiError)) throw httpError('Gemini', model, undefined, '', req.fallback)
    // Gemini answers a bad key with 400 API_KEY_INVALID rather than 401.
    if (e.status === 400 && /API_KEY_INVALID|API key not valid/i.test(e.message)) throw httpError('Gemini', model, 401, e.message, req.fallback)
    throw httpError('Gemini', model, e.status, e.message, req.fallback)
  }
}

const RUNNERS: Record<AiProvider, Runner> = { openai: viaOpenAI, anthropic: viaClaude, gemini: viaGemini }

/** Send the request to the active provider and return its raw JSON text. The caller checks there is a key. */
export async function callAiJson(req: AiJsonRequest, settings = activeProvider()): Promise<string> {
  try {
    return await RUNNERS[settings.provider](settings.apiKey, settings.model, req)
  } catch (e) {
    throw e instanceof AiError ? e : new AiError(`Something went wrong. Try again, or ${req.fallback}.`)
  }
}
