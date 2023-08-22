export class InefficientDynamodbStickerFinder {
  /**
   * @param {{
   *   dynamodbTagRepository: import('./tags/DynamodbTagRepository.js').DynamodbTagRepository
   * }} input 
   */
  constructor({ dynamodbTagRepository }) {
    this._dynamodbTagRepository = dynamodbTagRepository
  }

  /** @returns {Promise<import('./types.js').Sticker[]>} */
  async find({ query, authorUserId = undefined }) {
    const tags = await this._dynamodbTagRepository.inefficientlyScanTags({ query, authorUserId })
    
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
