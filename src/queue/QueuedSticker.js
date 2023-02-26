export class QueuedSticker {
  constructor({ stickerSetName, stickerFileId, userId }) {
    this.stickerSetName = stickerSetName
    this.stickerFileId = stickerFileId
    this.userId = userId
  }
}
