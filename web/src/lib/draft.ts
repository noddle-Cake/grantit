// Draft an answer from approved facts and approved PDFs. With an API key in Settings the chosen provider writes it,
// quoting a source for every sentence, and each PDF quote is checked against the PDF's text. Without a key the
// built-in drafter copies matching sentences instead, so the demo works offline.
import { assembleDraft, buildDraftRequest, DRAFT_SCHEMA, parseAiDraft } from '@grantit/shared/draft-prompt'
import { draftAnswerAsync, type DraftResult } from '@grantit/shared/drafting'
import type { AppState, Question, SourceDoc } from '@grantit/shared/types'
import { AiError, callAiJson } from './ai-json'
import { activeProvider, providerInfo } from './ai-settings'
import { approvedSources } from './doc-store'

export { AiError }

export interface Drafted extends DraftResult {
  /** Which engine wrote it: a provider's label ("Claude") or "built-in". */
  by: string
  /** Approved PDFs that couldn't be read in this browser, so the draft doesn't use them. */
  unreadable: SourceDoc[]
}

export async function draftFromKnowledge(q: Pick<Question, 'prompt' | 'wordLimit'>, state: Pick<AppState, 'org' | 'facts' | 'sourceDocs'>): Promise<Drafted> {
  const { passages, pages, unreadable } = await approvedSources(state.sourceDocs)
  const settings = activeProvider()
  if (!settings.apiKey) return { ...(await draftAnswerAsync(q, state.facts, passages)), by: 'built-in', unreadable }

  const req = buildDraftRequest(q, state.org.name, state.facts, passages)
  const json = await callAiJson(
    {
      system: req.system,
      prompt: req.prompt,
      schema: DRAFT_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'grant_answer',
      fallback: 'write the answer by hand',
      refusal: 'Claude declined to draft this answer. Write it by hand, or rephrase the question.',
    },
    settings,
  )
  let raw
  try {
    raw = parseAiDraft(json)
  } catch (e) {
    throw new AiError(`${(e as Error).message} Try again, or write the answer by hand.`)
  }
  return { ...assembleDraft(raw, req, q, state.facts, pages), by: providerInfo(settings.provider).label, unreadable }
}
