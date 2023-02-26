export class SearchStickersInteractor {
  constructor({ tagRepository, stickerRepository }) {
    this._tagRepository = tagRepository
    this._stickerRepository = stickerRepository
  }

  async execute({ query, authorUserId = undefined }) {
    const tags = await this._tagRepository.searchTags({ query, authorUserId })
    const stickers = await this._stickerRepository.queryStickers(
      tags.map(tag => ({
        stickerSetName: tag.stickerSetName,
        stickerFileId: tag.stickerFileId
      }))
    )

    return stickers
  }
}
