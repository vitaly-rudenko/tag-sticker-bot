import { INLINE_QUERY_RESULT_LIMIT, MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from '../../constants.js'
import { inlineQueryCacheTimeS } from '../../env.js'
import { normalizeTagValue } from '../../utils/tags.js'

/** @typedef {import('telegraf').Context} Context */

/**
 * @param {{
 *   tagRepository: import('../../types.d.ts').TagRepository
 * }} input
 */
export function useSearchFlow({ tagRepository }) {
  /** @param {Context} context */
  async function handleSearch(context) {
    if (!context.inlineQuery?.query) return

    const { userId } = context.state
    const authorUserId = context.inlineQuery.query.startsWith('!') ? userId : undefined
    const query = normalizeTagValue(
      authorUserId
        ? context.inlineQuery.query.slice(1)
        : context.inlineQuery.query
    )

    if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) return

    const stickersFileIds = await tagRepository.search({
      query,
      authorUserId,
      limit: INLINE_QUERY_RESULT_LIMIT,
    })

    await context.answerInlineQuery(
      stickersFileIds.map((sticker_file_id, i) => ({
        id: String(i),
        type: 'sticker',
        sticker_file_id,
      })),
      {
        cache_time: inlineQueryCacheTimeS,
        is_personal: Boolean(authorUserId),
        button: {
          text: "Can't find a sticker? Click here to contribute",
          start_parameter: 'stub', // for some reason is required
        }
      }
    )
  }

  return {
    handleSearch,
  }
}