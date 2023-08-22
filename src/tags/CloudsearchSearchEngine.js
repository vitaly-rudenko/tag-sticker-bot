import { UploadDocumentsCommand, SearchCommand } from '@aws-sdk/client-cloudsearch-domain'

export class CloudsearchSearchEngine {
  /**
   * @param {{
   *   cloudsearchDomainClient: import('@aws-sdk/client-cloudsearch-domain').CloudSearchDomainClient
   *   cloudsearchSearchClient: import('@aws-sdk/client-cloudsearch-domain').CloudSearchDomainClient
   *   tagRepository: import('../types.d.ts').TagRepository
   * }} options 
   */
  constructor({ cloudsearchDomainClient, cloudsearchSearchClient, tagRepository }) {
    this._cloudsearchDomainClient = cloudsearchDomainClient
    this._cloudsearchSearchClient = cloudsearchSearchClient
    this._tagRepository = tagRepository
  }

  /**
   * @param {{
   *   query: string
   *   authorUserId?: string
   * }} input
   * @returns {Promise<import('../types.d.ts').Sticker[]>}
   */
  async search({ query, authorUserId = undefined }) {
    const { hits } = await this._cloudsearchSearchClient.send(
      new SearchCommand({
        query,
        filterQuery: authorUserId ? `author_user_id:'${authorUserId}'` : undefined,
        size: 50,
      })
    )

    const stickerFileUniqueIds = (hits?.hit ?? [])
      .flatMap(hit => hit.fields?.sticker_file_unique_id?.[0] || [])

    return this._tagRepository.getTaggedStickers(stickerFileUniqueIds)
  }

  /** @param {import('../types.d.ts').Tag[]} tags */
  async index(tags) {
    await this._cloudsearchDomainClient.send(
      new UploadDocumentsCommand({
        contentType: 'application/json',
        documents: JSON.stringify(
          tags.map(tag => ({
            id: `${tag.authorUserId}_${tag.sticker.fileUniqueId}`,
            type: 'add',
            fields: {
              value: tag.value,
              author_user_id: tag.authorUserId,
              sticker_file_unique_id: tag.sticker.fileUniqueId,
            }
          }))
        )
      })
    )
  }
}
