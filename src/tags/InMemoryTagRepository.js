export class InMemoryTagRepository {
  constructor() {
    /** @type {import('../tags/Tag').Tag[]} */
    this._tags = []
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

  /** @returns {Promise<import('./Tag').Tag[]>} */
  async searchTags({ query, authorUserId = undefined }) {
    return this._tags
      .filter(tag => tag.value.includes(query) && (!authorUserId || tag.authorUserId === authorUserId))
  }
}
