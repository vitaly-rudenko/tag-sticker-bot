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

    if (query.length < 2 || query.length > 20) return

    const stickers = await stickerFinder.find({ query, authorUserId, limit: 50 })

    await context.answerInlineQuery(
      stickers.map((sticker, i) => ({
        id: String(i),
        type: 'sticker',
        sticker_file_id: sticker.fileId,
      })),
      {
        cache_time: isLocalTesting ? 5 : 300,
        is_personal: Boolean(authorUserId),
        switch_pm_text: "Can't find a sticker? Click here to contribute",
        switch_pm_parameter: 'stub', // for some reason it fails if not provided
      }
    )
  }

  return {
    handleSearch,
  }
}