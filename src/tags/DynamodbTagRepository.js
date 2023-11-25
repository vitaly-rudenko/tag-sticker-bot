import { BatchWriteItemCommand, paginateQuery } from '@aws-sdk/client-dynamodb'
import { tagAttributes as attr, tagId, valuePartition } from './attributes.js'
import { QUERY_STATUS_INDEX, SEARCH_BY_VALUE_AND_AUTHOR_INDEX, SEARCH_BY_VALUE_INDEX } from './indexes.js'

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
    this._storeWriteItemLimit = 5
    this._storeQueryPageSize = 100
    this._searchQueryPageSize = 100
    this._queryStatusQueryPageSize = 100
    this._maxTagsPerSticker = 25
  }

  /**
   * @param {{
   *   authorUserId: string
   *   sticker: import('../types.d.ts').MinimalSticker
   *   values: string[]
   * }} input
   */
  async store({ authorUserId, sticker, values }) {
    if (values.length === 0)
      throw new Error('Values list is empty')
    if (values.length > this._maxTagsPerSticker)
      throw new Error(`Cannot store more than ${this._maxTagsPerSticker} tags per request`)

    const existingTagPaginator = paginateQuery({ client: this._dynamodbClient, pageSize: this._storeQueryPageSize }, {
      ReturnConsumedCapacity: 'TOTAL',
      TableName: this._tableName,
      KeyConditionExpression: '#tagId = :tagId',
      ExpressionAttributeNames: {
        '#tagId': attr.tagId,
        '#value': attr.value,
      },
      ExpressionAttributeValues: {
        ':tagId': { S: tagId(authorUserId, sticker.file_unique_id) }
      },
      ProjectionExpression: '#tagId, #value',
    })

    const existingItems = []
    for await (const { Items, ConsumedCapacity, ScannedCount } of existingTagPaginator) {
      console.log('DynamodbTagRepository#store:query', { ConsumedCapacity, ScannedCount })
      if (!Items) continue
      existingItems.push(...Items)
    }

    const filteredValues = values.filter(value => !existingItems.some(item => value === item[attr.value]?.S))
    const filteredExistingItems = existingItems.filter(item => {
      const value = item[attr.value]?.S
      return value && !values.includes(value)
    })

    for (let i = 0; i < Math.max(filteredValues.length, filteredExistingItems.length); i += this._storeWriteItemLimit) {
      const { ConsumedCapacity, UnprocessedItems } = await this._dynamodbClient.send(
        new BatchWriteItemCommand({
          ReturnConsumedCapacity: 'TOTAL',
            RequestItems: {
              [this._tableName]: [
                ...filteredExistingItems.slice(i, i + this._storeWriteItemLimit).map(item => ({
                  DeleteRequest: {
                    Key: {
                      [attr.tagId]: item[attr.tagId],
                      [attr.value]: item[attr.value],
                    }
                  }
                })),
                ...filteredValues.slice(i, i + this._storeWriteItemLimit).map(value => ({
                  PutRequest: {
                    Item: {
                      [attr.tagId]: { S: tagId(authorUserId, sticker.file_unique_id) },
                      [attr.valuePartition]: { S: valuePartition(value) },
                      [attr.authorUserId]: { S: authorUserId },
                      ...sticker.set_name && { [attr.stickerSetName]: { S: sticker.set_name } },
                      [attr.stickerFileUniqueId]: { S: sticker.file_unique_id },
                      [attr.stickerFileId]: { S: sticker.file_id },
                      [attr.value]: { S: value },
                      [attr.createdAt]: { N: String(Math.trunc(Date.now() / 1000)) },
                    }
                  }
                })),
              ]
            }
        })
      )

      console.log('DynamodbTagRepository#store:batchWrite', { ConsumedCapacity, UnprocessedItems })
    }
  }

  /**
   * TODO: might be too slow when a lot of stickers are tagged in the set
   * 
   * @param {{
   *   stickerSetName: string
   *   authorUserId?: string
   * }} input
   * @returns {Promise<Set<string>>} Array of tagged stickerFileUniqueId
   */
  async queryStatus({ stickerSetName, authorUserId }) {
    const tagPaginator = paginateQuery({ client: this._dynamodbClient, pageSize: this._queryStatusQueryPageSize }, {
      TableName: this._tableName,
      IndexName: QUERY_STATUS_INDEX,
      KeyConditionExpression: authorUserId
        ? '#stickerSetName = :stickerSetName AND #authorUserId = :authorUserId'
        : '#stickerSetName = :stickerSetName',
      ExpressionAttributeNames: {
        '#stickerSetName': attr.stickerSetName,
        '#stickerFileUniqueId': attr.stickerFileUniqueId,
        ...authorUserId && { '#authorUserId': attr.authorUserId },
      },
      ExpressionAttributeValues: {
        ':stickerSetName': { S: stickerSetName },
        ...authorUserId && { ':authorUserId': { S: authorUserId } },
      },
      ReturnConsumedCapacity: 'TOTAL',
      ProjectionExpression: '#stickerFileUniqueId',
    })

    const stickerFileUniqueIds = new Set()
    for await (const { Items, ConsumedCapacity, ScannedCount } of tagPaginator) {
      console.log('DynamodbTagRepository#queryStatus:query', { ConsumedCapacity, ScannedCount })

      if (!Items) continue
      for (const item of Items) {
        stickerFileUniqueIds.add(item[attr.stickerFileUniqueId].S)
      }
    }

    return stickerFileUniqueIds
  }

  /**
   * @param {{
   *   query: string
   *   limit: number
   *   authorUserId?: string
   * }} input
   * @returns {Promise<string[]>} Array of stickerFileIds
   */
  async search({ query, limit, authorUserId }) {
    if (typeof query !== 'string' || !query) {
      throw new Error('Query must be a non-empty string')
    }

    const tagPaginator = paginateQuery({ client: this._dynamodbClient, pageSize: this._searchQueryPageSize }, {
      IndexName: authorUserId ? SEARCH_BY_VALUE_AND_AUTHOR_INDEX : SEARCH_BY_VALUE_INDEX,
      TableName: this._tableName,
      KeyConditionExpression: authorUserId
        ? '#authorUserId = :authorUserId AND begins_with(#value, :query)'
        : '#valuePartition = :valuePartition AND begins_with(#value, :query)',
      ExpressionAttributeNames: {
        '#value': attr.value,
        '#stickerFileId': attr.stickerFileId,
        '#stickerFileUniqueId': attr.stickerFileUniqueId,
        ...authorUserId
          ? { '#authorUserId': attr.authorUserId }
          : { '#valuePartition': attr.valuePartition },
      },
      ExpressionAttributeValues: {
        ':query': { S: query },
        ...authorUserId
          ? { ':authorUserId': { S: authorUserId } }
          : { ':valuePartition': { S: valuePartition(query) } },
      },
      ReturnConsumedCapacity: 'TOTAL',
      ProjectionExpression: '#stickerFileId, #stickerFileUniqueId',
    })
    
    /** @type {string[]} */
    const stickerFileIds = []
    const stickerFileUniqueIds = new Set()

    for await (const { Items, ConsumedCapacity, ScannedCount } of tagPaginator) {
      console.log('DynamodbTagRepository#search:query', { ConsumedCapacity, ScannedCount })

      if (!Items) {
        continue
      }

      for (const item of Items) {
        const stickerFileUniqueId = item[attr.stickerFileUniqueId]?.S
        if (!stickerFileUniqueId || stickerFileUniqueIds.has(stickerFileUniqueId)) {
          continue
        }
        
        const stickerFileId = item[attr.stickerFileId]?.S
        if (!stickerFileId) {
          continue
        }

        stickerFileIds.push(stickerFileId)
        stickerFileUniqueIds.add(stickerFileUniqueId)

        if (stickerFileUniqueIds.size === limit) {
          break
        }
      }

      if (stickerFileUniqueIds.size === limit) {
        break
      }
    }

    return stickerFileIds
  }
}
