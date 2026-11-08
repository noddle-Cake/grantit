import { AWARD_LETTER_INSTRUCTIONS, AWARD_LETTER_SCHEMA, parseAwardLetter, type ParsedAwardLetter } from '@grantit/shared/award-letter'
import { AiError, callAiJson } from './ai-json'
import { activeProvider, providerInfo } from './ai-settings'

const MAX_BYTES = 10 * 1024 * 1024
const PROMPT = 'Extract the award terms from this letter.'
const SCHEMA = AWARD_LETTER_SCHEMA as unknown as Record<string, unknown>

/** A failure the Setup tab shows as-is; manual entry keeps working. */
export class AwardLetterError extends Error {}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
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

  const pdf = { name: file.name || 'award-letter.pdf', base64: toBase64(new Uint8Array(await file.arrayBuffer())) }
  let text: string
  try {
    text = await callAiJson(
      {
        system: AWARD_LETTER_INSTRUCTIONS,
        prompt: PROMPT,
        schema: SCHEMA,
        schemaName: 'award_letter',
        pdf,
        fallback: 'enter the terms by hand',
        refusal: 'Claude declined to read this letter. Enter the terms by hand.',
      },
      { provider, apiKey, model },
    )
  } catch (e) {
    throw new AwardLetterError(e instanceof AiError ? e.message : 'Something went wrong reading the letter. Enter the terms by hand.')
  }

  const parsed = parseAwardLetter(text)
  const f = parsed.fields
  if (!f.amount && !f.periodStart && !f.periodEnd && !f.funderFiscalYearStartMonth && !f.categories)
    throw new AwardLetterError('The AI couldn’t find award terms in this PDF. Enter them by hand.')
  return parsed
}
