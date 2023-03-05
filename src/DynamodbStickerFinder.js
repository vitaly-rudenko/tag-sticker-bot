export class DynamodbStickerFinder {
  /**
   * @param {{
   *   dynamodbTagRepository: import('./tags/DynamodbTagRepository').DynamodbTagRepository
   * }} input 
   */
  constructor({ dynamodbTagRepository }) {
    this._dynamodbTagRepository = dynamodbTagRepository
  }

  /** @returns {Promise<Sticker[]>} */
  async find({ query, authorUserId = undefined }) {
    const tags = await this._dynamodbTagRepository.legacySearchTags({ query, authorUserId })
    
    const stickers = []
    const addedStickerFileUniqueIds = new Set()

    for (const tag of tags) {
      if (addedStickerFileUniqueIds.has(tag.sticker.fileUniqueId)) continue

      stickers.push({
        setName: tag.sticker.setName,
        fileId: tag.sticker.fileId,
        fileUniqueId: tag.sticker.fileUniqueId,
      })
    }

    return stickers
  }
}
