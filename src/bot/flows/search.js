import { INLINE_QUERY_RESULT_LIMIT, MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from '../../constants.js'
import { expandSearchResults } from '../../utils/expandSearchResults.js'
import { normalizeTagValue } from '../../utils/tags.js'
import { inlineQueryCacheTimeS } from '../../env.js'

/** @typedef {import('telegraf').Context} Context */

/**
 * @param {{
 *   telegram: import('telegraf').Telegram
 *   tagRepository: import('../../types.d.ts').TagRepository
 *   favoriteRepository: import('../../types.d.ts').FavoriteRepository
 * }} input
 */
export function useSearchFlow({ telegram, tagRepository, favoriteRepository }) {
  /** @param {Context} context */
  async function handleSearch(context) {
    if (context.inlineQuery?.query === undefined) return

    const { userId } = context.state
    const authorUserId = context.inlineQuery.query.startsWith('!') ? userId : undefined
    const query = normalizeTagValue(
      authorUserId
        ? context.inlineQuery.query.slice(1)
        : context.inlineQuery.query
    )

    const isFavoriteQuery = query.length === 0

    /** @type {import('../../types.d.ts').SearchResults} */
    let searchResults
    if (isFavoriteQuery) {
      searchResults = await favoriteRepository.search({
        userId,
        limit: INLINE_QUERY_RESULT_LIMIT,
      })
    } else if (query.length >= MIN_QUERY_LENGTH && query.length <= MAX_QUERY_LENGTH) {
      searchResults = await tagRepository.search({
        query,
        authorUserId,
        limit: INLINE_QUERY_RESULT_LIMIT,
      })
    } else {
      return
    }

    const stickers = await expandSearchResults({ telegram, searchResults, limit: INLINE_QUERY_RESULT_LIMIT })

    await context.answerInlineQuery(
      stickers.map((sticker, i) => ({
        id: String(i),
        type: 'sticker',
        sticker_file_id: sticker.file_id,
      })),
      {
        cache_time: inlineQueryCacheTimeS,
        is_personal: isFavoriteQuery || Boolean(authorUserId),
        button: {
          text: isFavoriteQuery
            ? stickers.length === 0
              ? "You don't have any favorite stickers yet. Click here to add"
              : "Click here to add or remove your favorite stickers"
            : "Can't find a sticker? Click here to contribute",
          start_parameter: 'stub', // for some reason is required
        }
      }
    )
  }

  return {
    handleSearch,
  }
}