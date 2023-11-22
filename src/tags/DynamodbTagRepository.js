import { BatchWriteItemCommand, QueryCommand, paginateQuery } from '@aws-sdk/client-dynamodb'
import { DEFAULT_AUTHOR_USER_ID, tagAttributes as attr, queryId, tagId, valueHash } from './attributes.js'
import { QUERY_STATUS_INDEX, SEARCH_BY_VALUE_INDEX } from './indexes.js'

const BATCH_WRITE_ITEM_LIMIT = 25

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
   * TODO: pagination
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

    const existingTagPaginator = paginateQuery({ client: this._dynamodbClient }, {
      TableName: this._tableName,
      KeyConditionExpression: '#tagId = :tagId',
      ExpressionAttributeNames: {
        '#tagId': attr.tagId,
      },
      ExpressionAttributeValues: {
        ':tagId': { S: tagId(authorUserId, sticker.file_unique_id) }
      },
    })

    const existingItems = []
    for await (const { Items } of existingTagPaginator) {
      if (!Items) continue
      existingItems.push(...Items)
    }

    if (existingItems.length > 0) {
      for (let i = 0; i < existingItems.length; i += BATCH_WRITE_ITEM_LIMIT) {
        await this._dynamodbClient.send(
          new BatchWriteItemCommand({
            RequestItems: {
              [this._tableName]: existingItems.slice(i, i + BATCH_WRITE_ITEM_LIMIT).map(item => ({
                DeleteRequest: {
                  Key: {
                    [attr.tagId]: item[attr.tagId],
                    [attr.valueHash]: item[attr.valueHash],
                  }
                }
              }))
            }
          })
        )
      }
    }

    const requestItems = values.flatMap(value => {
      const attributes = {
        [attr.tagId]: { S: tagId(authorUserId, sticker.file_unique_id) },
        [attr.authorUserId]: { S: authorUserId },
        ...sticker.set_name && { [attr.stickerSetName]: { S: sticker.set_name } },
        [attr.stickerFileUniqueId]: { S: sticker.file_unique_id },
        [attr.stickerFileId]: { S: sticker.file_id },
        [attr.value]: { S: value },
      }

      return [{
        PutRequest: {
          Item: {
            ...attributes,
            [attr.queryId]: { S: queryId(value, authorUserId) },
            [attr.valueHash]: { S: valueHash(value, authorUserId) },
          }
        }
      }, {
        PutRequest: {
          Item: {
            ...attributes,
            [attr.queryId]: { S: queryId(value) },
            [attr.valueHash]: { S: valueHash(value) },
          }
        }
      }]
    })

    for (let i = 0; i < requestItems.length; i += BATCH_WRITE_ITEM_LIMIT) {
      await this._dynamodbClient.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [this._tableName]: requestItems.slice(i, i + BATCH_WRITE_ITEM_LIMIT)
          }
        })
      )
    }
  }

  /**
   * TODO: might be too slow when a lot of stickers are tagged in the set
   * 
   * @param {{
   *   stickerSetName: string
   *   authorUserId?: string
   * }} input
   * @returns {Promise<string[]>} Array of tagged stickerFileUniqueId
   */
  async queryStatus({ stickerSetName, authorUserId }) {
    const tagPaginator = paginateQuery({ client: this._dynamodbClient }, {
      TableName: this._tableName,
      IndexName: QUERY_STATUS_INDEX,
      KeyConditionExpression: '#stickerSetName = :stickerSetName AND begins_with(#queryId, :queryId)',
      ExpressionAttributeNames: {
        '#stickerSetName': attr.stickerSetName,
        '#queryId': attr.queryId,
      },
      ExpressionAttributeValues: {
        ':stickerSetName': { S: stickerSetName },
        ':queryId': { S: `${authorUserId || ''}${DEFAULT_AUTHOR_USER_ID}` },
      },
    })

    const stickerFileUniqueIds = new Set()
    for await (const { Items } of tagPaginator) {
      if (!Items) continue
      for (const item of Items) {
        stickerFileUniqueIds.add(item[attr.stickerFileUniqueId].S)
      }
    }

    return [...stickerFileUniqueIds]
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

    const tagPaginator = paginateQuery({ client: this._dynamodbClient, pageSize: limit }, {
      IndexName: SEARCH_BY_VALUE_INDEX,
      TableName: this._tableName,
      KeyConditionExpression: '#queryId = :queryId AND begins_with(#value, :query)',
      ExpressionAttributeNames: {
        '#queryId': attr.queryId,
        '#value': attr.value,
      },
      ExpressionAttributeValues: {
        ':queryId': { S: queryId(query, authorUserId) },
        ':query': { S: query },
      },
    })
    
    const result = []
    for await (const { Items } of tagPaginator) {
      if (!Items) continue
      result.push(...Items)
    }

    return result.map(item => this._toEntity(item))
  }

  /** @returns {import('../types.d.ts').Tag} */
  _toEntity(attributes) {
    return {
      sticker: {
        set_name: attributes[attr.stickerSetName]?.S,
        file_unique_id: attributes[attr.stickerFileUniqueId].S,
        file_id: attributes[attr.stickerFileId].S,
      },
      authorUserId: attributes[attr.authorUserId].S,
      value: attributes[attr.value]?.S,
    }
  }
}
