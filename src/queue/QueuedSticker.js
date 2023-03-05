export class QueuedSticker {
  constructor({ stickerSetName, stickerFileUniqueId, stickerFileId, userId }) {
    this.stickerSetName = stickerSetName
    this.stickerFileUniqueId = stickerFileUniqueId
    this.stickerFileId = stickerFileId
    this.userId = userId
  }
}
