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
    
    /** @type {import('./types.d.ts').Sticker[]} */
    const stickers = []
    const stickerFileUniqueIds = new Set()

    for (const tag of tags) {
      if (stickerFileUniqueIds.has(tag.sticker.file_unique_id)) continue
      stickerFileUniqueIds.add(tag.sticker.file_unique_id)

      stickers.push({
        set_name: tag.sticker.set_name,
        file_id: tag.sticker.file_id,
        file_unique_id: tag.sticker.file_unique_id,
      })
    }

    return stickers
  }
}
