import { BatchGetItemCommand, BatchWriteItemCommand, PutItemCommand, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb'

const DEFAULT_AUTHOR_USER_ID = '#default'

// TODO: do not return duplicates in responses
export class DynamodbTagRepository {
  /**
   * @param {{
   *   dynamodbClient: import('@aws-sdk/client-dynamodb').DynamoDBClient,
   *   tableName: string
   * }} options 
   */
  constructor({ dynamodbClient, tableName }) {
    this._dynamodbClient = dynamodbClient
    this._tableName = tableName
  }

  /** @param {Tag} tag */
  async storeTag(tag) {
    await this._dynamodbClient.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [this._tableName]: [{
            PutRequest: {
              Item: this._toAttributes(tag),
            }
          }, {
            PutRequest: {
              Item: this._toAttributes({
                sticker: tag.sticker,
                authorUserId: DEFAULT_AUTHOR_USER_ID,
              }),
            }
          }]
        }
      })
    )
  }

  /**
   * @param {object} params
   * @param {string[]} params.stickerFileUniqueIds
   * @param {string} [params.authorUserId]
   * @returns {Promise<{ [stickerFileUniqueId: string]: boolean }>}
   */
  async queryTagStatus({ stickerFileUniqueIds, authorUserId }) {
    /** @type {Tag[]} */
    const tags = []

    for (let i = 0; i < stickerFileUniqueIds.length; i += 100) {
      const { Responses } = await this._dynamodbClient.send(
        new BatchGetItemCommand({
          RequestItems: {
            [this._tableName]: {
              Keys: stickerFileUniqueIds
                .slice(i, i + 100)
                .map((stickerFileUniqueId) => ({
                  authorUserId: { S: authorUserId || DEFAULT_AUTHOR_USER_ID },
                  stickerFileUniqueId: { S: stickerFileUniqueId },
                }))
            }
          }
        })
      )

      if (Responses?.[this._tableName]) {
        tags.push(...Responses[this._tableName].map(item => this._toEntity(item)))
      }
    }

    return stickerFileUniqueIds.reduce((statusMap, stickerFileUniqueId) => ({
      ...statusMap,
      [stickerFileUniqueId]: tags.some(tag => tag.sticker.fileUniqueId === stickerFileUniqueId),
    }), {})
  }

  // TODO: use CloudSearch
  /** @returns {Promise<Tag[]>} */
  async legacySearchTags({ query, authorUserId = undefined }) {
    if (typeof query !== 'string' || !query) {
      throw new Error('Invalid query: must be a non-empty string')
    }

    const { Items = [] } = await this._dynamodbClient.send(
      new ScanCommand({
        TableName: this._tableName,
      })
    )

    return Items
      .map(item => this._toEntity(item))
      .filter(tag => tag.value?.includes(query.toLowerCase()) && (!authorUserId || tag.authorUserId === authorUserId))
  }

  /** @param {Tag} tag */
  _toAttributes(tag) {
    return {
      stickerSetName: {
        S: tag.sticker.setName,
      },
      stickerFileUniqueId: {
        S: tag.sticker.fileUniqueId,
      },
      stickerFileId: {
        S: tag.sticker.fileId,
      },
      authorUserId: {
        S: tag.authorUserId,
      },
      ...tag.value && {
        value: {
          S: tag.value,
        }
      },
    }
  }

  /** @returns {Tag} */
  _toEntity(attributes) {
    return {
      sticker: {
        setName: attributes.stickerSetName.S,
        fileUniqueId: attributes.stickerFileUniqueId.S,
        fileId: attributes.stickerFileId.S,
      },
      authorUserId: attributes.authorUserId.S,
      value: attributes.value?.S,
    }
  }
}
