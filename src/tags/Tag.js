export class Tag {
  constructor({ stickerSetName, stickerFileUniqueId, stickerFileId, authorUserId, value = undefined }) {
    this.stickerSetName = stickerSetName
    this.stickerFileUniqueId = stickerFileUniqueId
    this.stickerFileId = stickerFileId
    this.authorUserId = authorUserId
    this.value = value
  }
}
