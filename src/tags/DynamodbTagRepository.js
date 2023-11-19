import { BatchGetItemCommand, BatchWriteItemCommand, PutItemCommand, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb'

const DEFAULT_AUTHOR_USER_ID = '#'
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
              Item: {
                uid: {
                  S: tag.sticker.fileUniqueId,
                },
                author: {
                  S: DEFAULT_AUTHOR_USER_ID,
                },
              }
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
    const fileUniqueIdMap = new Set()

    for (let i = 0; i < stickerFileUniqueIds.length; i += BATCH_GET_ITEM_LIMIT) {
      const { Responses } = await this._dynamodbClient.send(
        new BatchGetItemCommand({
          RequestItems: {
            [this._tableName]: {
              Keys: stickerFileUniqueIds
                .slice(i, i + BATCH_GET_ITEM_LIMIT)
                .map((stickerFileUniqueId) => ({
                  author: { S: authorUserId || DEFAULT_AUTHOR_USER_ID },
                  uid: { S: stickerFileUniqueId },
                }))
            }
          }
        })
      )

      if (Responses?.[this._tableName]) {
        for (const item of Responses[this._tableName]) {
          fileUniqueIdMap.add(item.uid.S)
        }
      }
    }

    return stickerFileUniqueIds.reduce((statusMap, stickerFileUniqueId) => ({
      ...statusMap,
      [stickerFileUniqueId]: fileUniqueIdMap.has(stickerFileUniqueId),
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
            ? 'author = :author AND contains(#value, :query)'
            : 'contains(#value, :query)',
          ExpressionAttributeNames: {
            '#value': 'value'
          },
          ExpressionAttributeValues: {
            ':query': {
              S: query.toLowerCase().trim(),
            },
            ...authorUserId && {
              ':author': {
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
      set: {
        S: tag.sticker.setName,
      },
      uid: {
        S: tag.sticker.fileUniqueId,
      },
      id: {
        S: tag.sticker.fileId,
      },
      author: {
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
        setName: attributes.set.S,
        fileUniqueId: attributes.uid.S,
        fileId: attributes.id.S,
      },
      authorUserId: attributes.author.S,
      value: attributes.value?.S,
    }
  }
}
