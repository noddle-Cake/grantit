import { AWARD_LETTER_INSTRUCTIONS, AWARD_LETTER_SCHEMA, parseAwardLetter, type ParsedAwardLetter } from '@grantit/shared/award-letter'
import { readAiSettings } from './ai-settings'

const MAX_BYTES = 10 * 1024 * 1024

/** A failure the Setup tab shows as-is; manual entry keeps working. */
export class AwardLetterError extends Error {}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/**
 * Send an award letter PDF to OpenAI (Responses API, structured output) and validate what comes back.
 * The SDK is loaded on demand so it isn't in the main bundle.
 */
export async function extractAwardLetter(file: File): Promise<ParsedAwardLetter> {
  const { apiKey, model } = readAiSettings()
  if (!apiKey) throw new AwardLetterError('Add your OpenAI API key in Settings to read award letters with AI. You can still fill in the form by hand.')
  if (file.type && file.type !== 'application/pdf') throw new AwardLetterError('Choose a PDF file.')
  if (file.size > MAX_BYTES) throw new AwardLetterError('That PDF is over 10 MB. Try a smaller file or enter the terms by hand.')

  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 120_000 })
  const data = toBase64(new Uint8Array(await file.arrayBuffer()))

  let text: string
  try {
    const response = await client.responses.create({
      model,
      instructions: AWARD_LETTER_INSTRUCTIONS,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_file', filename: file.name || 'award-letter.pdf', file_data: `data:application/pdf;base64,${data}` },
            { type: 'input_text', text: 'Extract the award terms from this letter.' },
          ],
        },
      ],
      text: { format: { type: 'json_schema', name: 'award_letter', strict: true, schema: AWARD_LETTER_SCHEMA as unknown as Record<string, unknown> } },
    })
    text = response.output_text
  } catch (e) {
    if (e instanceof OpenAI.AuthenticationError) throw new AwardLetterError('OpenAI rejected the API key. Check it in Settings.')
    if (e instanceof OpenAI.NotFoundError) throw new AwardLetterError(`OpenAI doesn't recognize the model “${model}”. Change it in Settings.`)
    if (e instanceof OpenAI.RateLimitError) throw new AwardLetterError('OpenAI rate limit or quota reached. Try again shortly, or enter the terms by hand.')
    if (e instanceof OpenAI.BadRequestError) throw new AwardLetterError(`OpenAI couldn't process this request: ${e.message}`)
    if (e instanceof OpenAI.APIError) throw new AwardLetterError(`OpenAI error${e.status ? ` ${e.status}` : ''}. Try again, or enter the terms by hand.`)
    throw new AwardLetterError('Couldn’t reach OpenAI. Check your connection, or enter the terms by hand.')
  }

  const parsed = parseAwardLetter(text)
  const f = parsed.fields
  if (!f.amount && !f.periodStart && !f.periodEnd && !f.funderFiscalYearStartMonth && !f.categories)
    throw new AwardLetterError('The AI couldn’t find award terms in this PDF. Enter them by hand.')
  return parsed
}
