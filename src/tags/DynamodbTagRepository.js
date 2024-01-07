import { BatchWriteItemCommand, paginateQuery } from '@aws-sdk/client-dynamodb'
import { tagAttributes as attr, tagId, valuePartition } from './attributes.js'
import { QUERY_STATUS_INDEX, SEARCH_BY_VALUE_AND_AUTHOR_INDEX, SEARCH_BY_VALUE_INDEX } from './indexes.js'
import { logger } from '../logger.js'

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
   *   isPrivate: boolean
   *   sticker: import('../types.d.ts').MinimalStickerWithSet
   *   values: string[]
   * }} input
   */
  async store({ authorUserId, isPrivate, sticker, values }) {
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

    /** @type {Record<string, import('@aws-sdk/client-dynamodb').AttributeValue>[]} */
    const existingItems = []
    for await (const { Items, ConsumedCapacity, ScannedCount } of existingTagPaginator) {
      logger.debug({ ConsumedCapacity, ScannedCount }, 'DynamodbTagRepository#store:query')
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
                      [attr.valuePartition]: { S: valuePartition({ value, privateAuthorUserId: isPrivate ? authorUserId : undefined }) },
                      [attr.isPrivate]: { BOOL: isPrivate },
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

      logger.debug({ ConsumedCapacity, UnprocessedItems }, 'DynamodbTagRepository#store:batchWrite')
    }
  }

  /**
   * TODO: might be too slow when a lot of stickers are tagged in the set
   *
   * @param {{
   *   stickerSetName: string
   *   authorUserId: string
   *   ownedOnly: boolean
   * }} input
   * @returns {Promise<Set<string>>} Array of tagged stickerFileUniqueId
   */
  async queryStatus({ stickerSetName, authorUserId, ownedOnly }) {
    const tagPaginator = paginateQuery({ client: this._dynamodbClient, pageSize: this._queryStatusQueryPageSize }, {
      TableName: this._tableName,
      IndexName: QUERY_STATUS_INDEX,
      KeyConditionExpression: ownedOnly
        ? '#stickerSetName = :stickerSetName AND #authorUserId = :authorUserId'
        : '#stickerSetName = :stickerSetName',
      ExpressionAttributeNames: {
        '#stickerSetName': attr.stickerSetName,
        '#stickerFileUniqueId': attr.stickerFileUniqueId,
        '#authorUserId': attr.authorUserId,
        '#isPrivate': attr.isPrivate,
      },
      ExpressionAttributeValues: {
        ':stickerSetName': { S: stickerSetName },
        ...ownedOnly && { ':authorUserId': { S: authorUserId } },
      },
      ReturnConsumedCapacity: 'TOTAL',
      ProjectionExpression: '#stickerFileUniqueId, #isPrivate, #authorUserId',
    })

    const stickerFileUniqueIds = new Set()
    for await (const { Items, ConsumedCapacity, ScannedCount } of tagPaginator) {
      logger.debug({ ConsumedCapacity, ScannedCount }, 'DynamodbTagRepository#queryStatus:query')

      if (!Items) continue
      for (const item of Items) {
        if (!ownedOnly && item[attr.isPrivate]?.BOOL && item[attr.authorUserId].S !== authorUserId) {
          continue
        }

        stickerFileUniqueIds.add(item[attr.stickerFileUniqueId].S)
      }
    }

    return stickerFileUniqueIds
  }

  /**
   * @param {{
   *   query: string
   *   limit: number
   *   authorUserId: string
   *   ownedOnly: boolean
   * }} input
   * @returns {Promise<{
   *   searchResults: import('../types.d.ts').MinimalSticker[]
   *   includesOwnedStickers: boolean
   * }>}
   */
  async search({ query, limit, authorUserId, ownedOnly }) {
    if (typeof query !== 'string' || !query) {
      throw new Error('Query must be a non-empty string')
    }

    // always search in owned tags first
    const { stickerFileUniqueIds, stickers: ownedStickers } = await this._search({ query, limit, authorUserId })
    const remainingLimit = limit - ownedStickers.length

    // search in public tags if necessary
    if (!ownedOnly && remainingLimit > 0) {
      const { stickers: publicStickers } = await this._search({
        query,
        limit: remainingLimit,
        excludeStickerFileUniqueIds: stickerFileUniqueIds
      })

      return {
        searchResults: ownedStickers.concat(publicStickers),
        includesOwnedStickers: ownedStickers.length > 0
      }
    } else {
      return {
        searchResults: ownedStickers,
        includesOwnedStickers: ownedStickers.length > 0
      }
    }
  }

  /**
   * @param {{
   *   query: string
   *   limit: number
   *   authorUserId?: string
   *   excludeStickerFileUniqueIds?: Set<string>
   * }} input
   */
  async _search({ query, limit, authorUserId, excludeStickerFileUniqueIds }) {
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
          : { ':valuePartition': { S: valuePartition({ value: query }) } },
      },
      ReturnConsumedCapacity: 'TOTAL',
      ProjectionExpression: '#stickerFileId, #stickerFileUniqueId',
    })

    const stickers = []
    const stickerFileUniqueIds = new Set()

    for await (const { Items, ConsumedCapacity, ScannedCount } of tagPaginator) {
      logger.debug({ ConsumedCapacity, ScannedCount }, 'DynamodbTagRepository#search:query')

      if (!Items) {
        continue
      }

      for (const item of Items) {
        const stickerFileUniqueId = item[attr.stickerFileUniqueId]?.S
        if (!stickerFileUniqueId) continue
        if (stickerFileUniqueIds.has(stickerFileUniqueId)) continue
        if (excludeStickerFileUniqueIds?.has(stickerFileUniqueId)) continue

        const stickerFileId = item[attr.stickerFileId]?.S
        if (!stickerFileId) {
          continue
        }

        stickers.push({ file_id: stickerFileId, file_unique_id: stickerFileUniqueId })
        stickerFileUniqueIds.add(stickerFileUniqueId)

        if (stickerFileUniqueIds.size === limit) {
          break
        }
      }

      if (stickerFileUniqueIds.size === limit) {
        break
      }
    }

    return { stickerFileUniqueIds, stickers }
  }
}
