import { INLINE_QUERY_RESULT_LIMIT, MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from '../../constants.js'
import { inlineQueryCacheTimeS } from '../../env.js'
import { normalizeTagValue } from '../../utils/tags.js'

/** @typedef {import('telegraf').Context} Context */

/**
 * @param {{
 *   tagRepository: import('../../types.d.ts').TagRepository
 *   favoriteRepository: import('../../types.d.ts').FavoriteRepository
 * }} input
 */
export function useSearchFlow({ tagRepository, favoriteRepository }) {
  /** @param {Context} context */
  async function handleSearch(context) {
    if (context.inlineQuery?.query === undefined) return

    const { userId } = context.state
    const ownedOnly = context.inlineQuery.query.startsWith('!')
    const query = normalizeTagValue(
      ownedOnly
        ? context.inlineQuery.query.slice(1)
        : context.inlineQuery.query
    )

    const isFavoriteQuery = query.length === 0

    /** @type {import('../../types.d.ts').File[]} */
    let searchResults = []
    let includesOwnedFiles = false
    if (isFavoriteQuery) {
      searchResults = await favoriteRepository.query({
        userId,
        limit: INLINE_QUERY_RESULT_LIMIT,
      })
    } else if (query.length >= MIN_QUERY_LENGTH && query.length <= MAX_QUERY_LENGTH) {
      ({ searchResults, includesOwnedFiles } = await tagRepository.search({
        query,
        authorUserId: userId,
        ownedOnly,
        limit: INLINE_QUERY_RESULT_LIMIT,
      }))
    } else {
      return
    }

    await context.answerInlineQuery(
      searchResults.map((file, i) => {
        if (file.mime_type === 'video/mp4') {
          return {
            id: String(i),
            type: 'mpeg4_gif',
            mpeg4_file_id: file.file_id,
          }
        }

        if (file.mime_type === 'image/gif') {
          return {
            id: String(i),
            type: 'gif',
            gif_file_id: file.file_id,
          }
        }

        return {
          type: 'sticker',
          id: String(i),
          sticker_file_id: file.file_id,
        }
      }),
      {
        cache_time: inlineQueryCacheTimeS,
        is_personal: isFavoriteQuery || includesOwnedFiles,
        button: {
          text: isFavoriteQuery
            ? searchResults.length === 0
              ? "You don't have any favorite stickers or GIFs yet. Click here to add"
              : "Click here to add or remove your favorite stickers or GIFs"
            : "Can't find a sticker or GIF? Click here to contribute",
          start_parameter: 'stub', // for some reason is required
        }
      }
    )
  }

  return {
    handleSearch,
  }
}