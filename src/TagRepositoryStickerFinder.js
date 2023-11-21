export class TagRepositoryStickerFinder {
  /**
   * @param {{
   *   tagRepository: import('./types.d.ts').TagRepository
   * }} input 
   */
  constructor({ tagRepository }) {
    this._tagRepository = tagRepository
  }

  /** @returns {Promise<import('./types.d.ts').Sticker[]>} */
  async find({ query, limit, authorUserId = undefined }) {
    const tags = await this._tagRepository.search({ query, limit, authorUserId })
    
    const stickers = []
    const stickerFileUniqueIds = new Set()

    for (const tag of tags) {
      if (stickerFileUniqueIds.has(tag.sticker.fileUniqueId)) continue
      stickerFileUniqueIds.add(tag.sticker.fileUniqueId)

      stickers.push({
        setName: tag.sticker.setName,
        fileId: tag.sticker.fileId,
        fileUniqueId: tag.sticker.fileUniqueId,
      })
    }

    return stickers
  }
}
