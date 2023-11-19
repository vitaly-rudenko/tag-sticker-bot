import { BatchGetItemCommand, BatchWriteItemCommand, PutItemCommand, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb'

const DEFAULT_AUTHOR_USER_ID = '#default'
const BATCH_GET_ITEM_LIMIT = 100

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

  /** @param {import('../types.d.ts').Tag} tag */
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
              // mark sticker as tagged for queryTagStatus()
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
    /** @type {import('../types.d.ts').Tag[]} */
    const tags = []

    for (let i = 0; i < stickerFileUniqueIds.length; i += BATCH_GET_ITEM_LIMIT) {
      const { Responses } = await this._dynamodbClient.send(
        new BatchGetItemCommand({
          RequestItems: {
            [this._tableName]: {
              Keys: stickerFileUniqueIds
                .slice(i, i + BATCH_GET_ITEM_LIMIT)
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

  /**
   * @param {{
   *   query: string
   *   limit: number
   *   authorUserId?: string
   * }} input
   * @returns {Promise<import('../types.d.ts').Tag[]>}
   */
  async scanTags({ query, authorUserId = undefined, limit }) {
    if (typeof query !== 'string' || !query) {
      throw new Error('Invalid query: must be a non-empty string')
    }

    let lastEvaluatedKey = undefined
    let result = []

    do {
      const { Items = [], LastEvaluatedKey } = await this._dynamodbClient.send(
        new ScanCommand({
          TableName: this._tableName,
          FilterExpression: authorUserId
            ? 'authorUserId = :authorUserId AND contains(#value, :query)'
            : 'contains(#value, :query)',
          ExpressionAttributeNames: {
            '#value': 'value'
          },
          ExpressionAttributeValues: {
            ':query': {
              S: query.toLowerCase().trim(),
            },
            ...authorUserId && {
              ':authorUserId': {
                S: authorUserId,
              }
            }
          },
          ExclusiveStartKey: lastEvaluatedKey,
        })
      )

      result.push(...Items)

      lastEvaluatedKey = LastEvaluatedKey
    } while (lastEvaluatedKey && result.length < limit)

    return result
      .slice(0, limit)
      .map(item => this._toEntity(item))
  }

  /** @param {import('../types.d.ts').Tag} tag */
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

  /** @returns {import('../types.d.ts').Tag} */
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
