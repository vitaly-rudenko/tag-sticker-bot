/** @typedef {import('telegraf').Context} Context */

/**
 * @param {{
 *   stickerFinder: import('../../DynamodbStickerFinder').DynamodbStickerFinder
 * }} input
 */
export function useSearchFlow({ stickerFinder }) {
  /** @param {Context} context */
  async function handleSearch(context) {
    if (!context.inlineQuery?.query) return

    const { userId } = context.state
    const authorUserId = context.inlineQuery.query.startsWith('!') ? userId : undefined
    const query = context.inlineQuery.query.slice(authorUserId ? 1 : 0)

    const stickers = await stickerFinder.find({ query, authorUserId })

    await context.answerInlineQuery(
      stickers.map((sticker, i) => ({
        id: String(i),
        type: 'sticker',
        sticker_file_id: sticker.fileId,
      }))
    )
  }

  return {
    handleSearch,
  }
}