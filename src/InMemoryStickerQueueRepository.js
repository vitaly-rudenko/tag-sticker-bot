export class InMemoryStickerQueueRepository {
  constructor() {
    /** @type {import('./QueuedSticker').QueuedSticker[]} */
    this._queuedStickers = []
  }

  /**
   * @param {{
   *   userId: string
   *   stickers: import('./Sticker').Sticker[]
   * }} input
   */
  async enqueue({ userId, stickers }) {
    this._queuedStickers = this._queuedStickers.filter(queuedSticker => (
      queuedSticker.userId !== userId &&
      !stickers.find(sticker => sticker.stickerSetName === queuedSticker.stickerSetName && sticker.fileId === queuedSticker.stickerFileId
    )))

    this._queuedStickers.push(
      ...stickers.map(sticker => ({
        userId,
        stickerSetName: sticker.stickerSetName,
        stickerFileId: sticker.fileId,
      }))
    )
  }

  async take(userId) {
    const index = this._queuedStickers.findIndex(sticker => sticker.userId === userId)
    return index === -1 ? undefined : this._queuedStickers.splice(index, 1)[0]
  }

  async clear(userId) {
    this._queuedStickers = this._queuedStickers.filter(sticker => sticker.userId !== userId)
  }

  async count(userId) {
    return this._queuedStickers.filter(queuedSticker => queuedSticker.userId === userId).length
  }
}
