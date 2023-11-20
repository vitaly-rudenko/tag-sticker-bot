import { INLINE_QUERY_CACHE_TIME_LOCAL_S, INLINE_QUERY_CACHE_TIME_S, INLINE_QUERY_RESULT_LIMIT, MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from '../../constants.js'
import { isLocalTesting } from '../../env.js'

/** @typedef {import('telegraf').Context} Context */

/**
 * @param {{
 *   stickerFinder: import('../../types.d.ts').StickerFinder
 * }} input
 */
export function useSearchFlow({ stickerFinder }) {
  /** @param {Context} context */
  async function handleSearch(context) {
    if (!context.inlineQuery?.query) return

    const { userId } = context.state
    const authorUserId = context.inlineQuery.query.startsWith('!') ? userId : undefined
    const query = context.inlineQuery.query.slice(authorUserId ? 1 : 0)

    if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) return

    const stickers = await stickerFinder.find({
      query,
      authorUserId,
      limit: INLINE_QUERY_RESULT_LIMIT,
    })

    await context.answerInlineQuery(
      stickers.map((sticker, i) => ({
        id: String(i),
        type: 'sticker',
        sticker_file_id: sticker.fileId,
      })),
      {
        cache_time: isLocalTesting
          ? INLINE_QUERY_CACHE_TIME_LOCAL_S
          : INLINE_QUERY_CACHE_TIME_S,
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