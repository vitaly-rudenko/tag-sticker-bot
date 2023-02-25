export class InMemoryStickerRepository {
  constructor() {
    /** @type {import('./Sticker').Sticker[]} */
    this._stickers = []
    /** @type {import('./StickerSet').StickerSet[]} */
    this._stickerSets = []
    /** @type {import('./Tag').Tag[]} */
    this._tags = []
  }

  /**
   * @param {{
   *   name: string
   *   title: string
   *   stickers: { fileId }[]
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
      ...stickers.map(({ fileId }) => ({
        stickerSetName: name,
        fileId,
      }))
    )
  }

  async getStickers(stickerSetName) {
    return this._stickers.filter(sticker => sticker.stickerSetName === stickerSetName)
  }

  async getTags(stickerSetName, stickerFileId) {
    return this._tags.filter(tag => tag.stickerSetName === stickerSetName && tag.stickerFileId === stickerFileId)
  }

  async setTag({ stickerSetName, stickerFileId, authorUserId, value }) {
    this._tags = this._tags.filter(tag => !(tag.stickerSetName === stickerSetName && tag.stickerFileId === stickerFileId && tag.authorUserId === authorUserId))
    this._tags.push({
      stickerSetName,
      stickerFileId,
      authorUserId,
      value,
    })
  }

  /** @returns {Promise<import('./Sticker').Sticker[]>} */
  async search(query) {
    return this._tags
      .filter(tag => tag.value.includes(query))
      .map(tag => this._stickers.find(sticker => sticker.stickerSetName === tag.stickerSetName && sticker.fileId === tag.stickerFileId))
      .filter(Boolean)
  }
}
