export class InMemoryStickerRepository {
  constructor() {
    /** @type {import('./Sticker').Sticker[]} */
    this._stickers = []
    /** @type {import('./StickerSet').StickerSet[]} */
    this._stickerSets = []
  }

  /**
   * @param {{
   *   name: string
   *   title: string
   *   stickers: { stickerFileId }[]
   * }} input
   */
  async storeStickerSet({
    name,
    title,
    stickers,
  }) {
    this._stickerSets = this._stickerSets.filter(set => set.name !== name)
    this._stickers = this._stickers.filter(set => set.stickerSetName !== name)

    this._stickerSets.push({ name, title })
    this._stickers.push(
      ...stickers.map(({ stickerFileId }) => ({
        stickerSetName: name,
        stickerFileId,
      }))
    )
  }

  /**
   * @param {{
   *   stickerSetName: string
   *   stickerFileId?: string
   * }[]} queries
   */
  async queryStickers(queries) {
    return this._stickers.filter(
      sticker => queries.some(query => (
        query.stickerSetName === sticker.stickerSetName &&
        (!query.stickerFileId || query.stickerFileId === sticker.stickerFileId)
      ))
    )
  }
}
