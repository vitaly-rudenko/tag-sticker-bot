import { BatchGetItemCommand, BatchWriteItemCommand, PutItemCommand, QueryCommand, ScanCommand, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb'

const DEFAULT_AUTHOR_USER_ID = '#'
const BATCH_GET_ITEM_LIMIT = 100
const BATCH_WRITE_ITEM_LIMIT = 25

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

  /**
   * TODO: transaction possible?
   * 
   * @param {{
   *   authorUserId: string
   *   sticker: import('../types.d.ts').Sticker
   *   values: string[]
   * }} input
   */
  async store({ authorUserId, sticker, values }) {
    if (values.length === 0) {
      throw new Error('Values list is empty')
    }
    if (values.length > BATCH_WRITE_ITEM_LIMIT) {
      throw new Error(`Cannot store more than ${BATCH_WRITE_ITEM_LIMIT} tags per request`)
    }

    const { Items = [] } = await this._dynamodbClient.send(
      new QueryCommand({
        TableName: this._tableName,
        KeyConditionExpression: '#id = :id',
        ExpressionAttributeNames: {
          '#id': 'id',
        },
        ExpressionAttributeValues: {
          ':id': { S: `${authorUserId}#${sticker.fileUniqueId}` }
        },
      })
    )

    if (Items.length > 0) {
      await this._dynamodbClient.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [this._tableName]: Items.map(item => ({
              DeleteRequest: {
                Key: {
                  id: item.id,
                  value: item.value,
                }
              }
            }))
          }
        })
      )
    }

    await this._dynamodbClient.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [this._tableName]: values.flatMap(value => [{
            PutRequest: {
              Item: this._toAttributes({
                authorUserId,
                sticker,
                value,
              })
            }
          }, {
            PutRequest: {
              Item: this._toAttributes({
                authorUserId: DEFAULT_AUTHOR_USER_ID,
                sticker,
                value,
              }),
            }
          }])
        }
      })
    )
  }

  /**
   * @param {{
   *   stickerSetName: string
   *   authorUserId?: string
   * }} input
   * @returns {Promise<string[]>} Array of stickerFileUniqueId
   */
  async queryStatus({ stickerSetName, authorUserId }) {
    const { Items = [] } = await this._dynamodbClient.send(
      new QueryCommand({
        TableName: this._tableName,
        IndexName: 'query-status-index',
        KeyConditionExpression: '#set = :set AND author = :author',
        ExpressionAttributeNames: {
          '#set': 'set'
        },
        ExpressionAttributeValues: {
          ':set': { S: stickerSetName },
          ':author': { S: authorUserId || DEFAULT_AUTHOR_USER_ID },
        }
      })
    )

    // @ts-ignore
    return Items.map(item => item.fuid.S)
  }

  /**
   * TODO: test limit & evaluation key
   * 
   * @param {{
   *   query: string
   *   limit: number
   *   authorUserId?: string
   * }} input
   * @returns {Promise<import('../types.d.ts').Tag[]>}
   */
  async search({ query, limit, authorUserId }) {
    if (typeof query !== 'string' || !query) {
      throw new Error('Query must be a non-empty string')
    }

    let lastEvaluatedKey = undefined
    let result = []

    do {
      const { Items = [], LastEvaluatedKey } = await this._dynamodbClient.send(
        new QueryCommand({
          IndexName: 'search-by-value-index',
          TableName: this._tableName,
          KeyConditionExpression: 'author = :author AND begins_with(#v, :value)',
          ExpressionAttributeNames: {
            '#v': 'value',
          },
          ExpressionAttributeValues: {
            ':value': { S: query },
            ':author': { S: authorUserId || '#' },
          },
          ExclusiveStartKey: lastEvaluatedKey,
          Limit: limit - result.length,
        })
      )

      result.push(...Items)

      lastEvaluatedKey = LastEvaluatedKey
    } while (lastEvaluatedKey && result.length < limit)

    return result.map(item => this._toEntity(item))
  }

  /** @param {import('../types.d.ts').Tag} tag */
  _toAttributes(tag) {
    return {
      id: {
        S: `${tag.authorUserId}#${tag.sticker.fileUniqueId}`
      },
      set: {
        S: tag.sticker.setName,
      },
      fuid: {
        S: tag.sticker.fileUniqueId,
      },
      fid: {
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
        fileUniqueId: attributes.fuid.S,
        fileId: attributes.fid.S,
      },
      authorUserId: attributes.author.S,
      value: attributes.value?.S,
    }
  }
}
