export function useSearchFlow({ tagRepository }) {
  async function handleSearch(context) {
    if (!context.inlineQuery.query) return

    const { userId } = context.state
    const authorUserId = context.inlineQuery.query.startsWith('!') ? userId : undefined
    const query = context.inlineQuery.query.slice(authorUserId ? 1 : 0)

    const tags = await tagRepository.searchTags({ query, authorUserId })

    await context.answerInlineQuery(
      tags.map((tag, i) => ({
        id: String(i),
        type: 'sticker',
        sticker_file_id: tag.stickerFileId
      }))
    )
  }

  return {
    handleSearch,
  }
}