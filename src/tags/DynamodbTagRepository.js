import { BatchWriteItemCommand, paginateQuery } from '@aws-sdk/client-dynamodb'
import { tagAttributes as attr, tagId, valuePartition } from './attributes.js'
import { QUERY_STATUS_INDEX, SEARCH_BY_VALUE_AND_AUTHOR_INDEX, SEARCH_BY_VALUE_INDEX } from './indexes.js'
import { logger } from '../logger.js'
import { encodeMimeType, decodeMimeType } from '../utils/mimeType.js'

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
    this._maxTagsPerFile = 25
  }

  /**
   * @param {{
   *   file: import('../types.d.ts').File
   *   authorUserId: string
   *   isPrivate: boolean
   *   values: string[]
   * }} input
   */
  async store({ file, authorUserId, isPrivate, values }) {
    if (values.length === 0)
      throw new Error('Values list is empty')
    if (values.length > this._maxTagsPerFile)
      throw new Error(`Cannot store more than ${this._maxTagsPerFile} tags per request`)

    const existingTagPaginator = paginateQuery({ client: this._dynamodbClient, pageSize: this._storeQueryPageSize }, {
      ReturnConsumedCapacity: 'TOTAL',
      TableName: this._tableName,
      KeyConditionExpression: '#tagId = :tagId',
      ExpressionAttributeNames: {
        '#tagId': attr.tagId,
        '#value': attr.value,
      },
      ExpressionAttributeValues: {
        ':tagId': { S: tagId(authorUserId, file.file_unique_id) }
      },
      ProjectionExpression: '#tagId, #value',
    })

    const existingItems = []
    for await (const { Items, ConsumedCapacity, ScannedCount } of existingTagPaginator) {
      logger.debug({ ConsumedCapacity, ScannedCount }, 'DynamodbTagRepository#store:query')
      if (!Items) continue
      existingItems.push(...Items)
    }

    const itemsToDelete = existingItems.filter(item => {
      const value = item[attr.value]?.S
      return !value || !values.includes(value)
    })

    for (let i = 0; i < Math.max(values.length, itemsToDelete.length); i += this._storeWriteItemLimit) {
      const { ConsumedCapacity, UnprocessedItems } = await this._dynamodbClient.send(
        new BatchWriteItemCommand({
          ReturnConsumedCapacity: 'TOTAL',
            RequestItems: {
              [this._tableName]: [
                ...itemsToDelete.slice(i, i + this._storeWriteItemLimit).map(item => ({
                  DeleteRequest: {
                    Key: {
                      [attr.tagId]: item[attr.tagId],
                      [attr.value]: item[attr.value],
                    }
                  }
                })),
                ...values.slice(i, i + this._storeWriteItemLimit).map(value => ({
                  PutRequest: {
                    Item: {
                      [attr.tagId]: { S: tagId(authorUserId, file.file_unique_id) },
                      [attr.valuePartition]: { S: valuePartition({ value, privateAuthorUserId: isPrivate ? authorUserId : undefined }) },
                      [attr.authorUserId]: { S: authorUserId },
                      [attr.fileUniqueId]: { S: file.file_unique_id },
                      [attr.fileId]: { S: file.file_id },
                      [attr.value]: { S: value },
                      [attr.createdAt]: { N: String(Math.trunc(Date.now() / 1000)) },
                      ...isPrivate && { [attr.isPrivate]: { BOOL: true } },
                      ...file.set_name && { [attr.stickerSetName]: { S: file.set_name } },
                      ...file.mime_type && { [attr.animationMimeType]: { N: encodeMimeType(file.mime_type) } },
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
   * @returns {Promise<Set<string>>} Array of tagged fileUniqueId
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
        '#fileUniqueId': attr.fileUniqueId,
        '#authorUserId': attr.authorUserId,
        '#isPrivate': attr.isPrivate,
      },
      ExpressionAttributeValues: {
        ':stickerSetName': { S: stickerSetName },
        ...ownedOnly && { ':authorUserId': { S: authorUserId } },
      },
      ReturnConsumedCapacity: 'TOTAL',
      ProjectionExpression: '#fileUniqueId, #isPrivate, #authorUserId',
    })

    const fileUniqueIds = new Set()
    for await (const { Items, ConsumedCapacity, ScannedCount } of tagPaginator) {
      logger.debug({ ConsumedCapacity, ScannedCount }, 'DynamodbTagRepository#queryStatus:query')

      if (!Items) continue
      for (const item of Items) {
        if (!ownedOnly && item[attr.isPrivate]?.BOOL && item[attr.authorUserId].S !== authorUserId) {
          continue
        }

        fileUniqueIds.add(item[attr.fileUniqueId].S)
      }
    }

    return fileUniqueIds
  }

  /**
   * @param {{
   *   query: string
   *   limit: number
   *   authorUserId: string
   *   ownedOnly: boolean
   * }} input
   * @returns {Promise<{
   *   searchResults: import('../types.d.ts').File[]
   *   includesOwnedFiles: boolean
   * }>}
   */
  async search({ query, limit, authorUserId, ownedOnly }) {
    if (typeof query !== 'string' || !query) {
      throw new Error('Query must be a non-empty string')
    }

    // always search in owned tags first
    const { fileUniqueIds, files: ownedFiles } = await this._search({ query, limit, authorUserId })
    const remainingLimit = limit - ownedFiles.length

    // search in public tags if necessary
    if (!ownedOnly && remainingLimit > 0) {
      const { files: publicFiles } = await this._search({
        query,
        limit: remainingLimit,
        excludeFileUniqueIds: fileUniqueIds
      })

      return {
        searchResults: ownedFiles.concat(publicFiles),
        includesOwnedFiles: ownedFiles.length > 0
      }
    } else {
      return {
        searchResults: ownedFiles,
        includesOwnedFiles: ownedFiles.length > 0
      }
    }
  }

  /**
   * @param {{
   *   query: string
   *   limit: number
   *   authorUserId?: string
   *   excludeFileUniqueIds?: Set<string>
   * }} input
   */
  async _search({ query, limit, authorUserId, excludeFileUniqueIds }) {
    const tagPaginator = paginateQuery({ client: this._dynamodbClient, pageSize: this._searchQueryPageSize }, {
      IndexName: authorUserId ? SEARCH_BY_VALUE_AND_AUTHOR_INDEX : SEARCH_BY_VALUE_INDEX,
      TableName: this._tableName,
      KeyConditionExpression: authorUserId
        ? '#authorUserId = :authorUserId AND begins_with(#value, :query)'
        : '#valuePartition = :valuePartition AND begins_with(#value, :query)',
      ExpressionAttributeNames: {
        '#value': attr.value,
        '#fileId': attr.fileId,
        '#fileUniqueId': attr.fileUniqueId,
        '#animationMimeType': attr.animationMimeType,
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
      ProjectionExpression: '#fileId, #fileUniqueId, #animationMimeType',
    })

    const files = []
    const fileUniqueIds = new Set()

    for await (const { Items, ConsumedCapacity, ScannedCount } of tagPaginator) {
      logger.debug({ ConsumedCapacity, ScannedCount }, 'DynamodbTagRepository#search:query')

      if (!Items) {
        continue
      }

      for (const item of Items) {
        const fileUniqueId = item[attr.fileUniqueId]?.S
        if (!fileUniqueId) continue
        if (fileUniqueIds.has(fileUniqueId)) continue
        if (excludeFileUniqueIds?.has(fileUniqueId)) continue

        const fileId = item[attr.fileId]?.S
        if (!fileId) {
          continue
        }

        fileUniqueIds.add(fileUniqueId)
        files.push({
          file_id: fileId,
          file_unique_id: fileUniqueId,
          mime_type: decodeMimeType(item[attr.animationMimeType]?.N),
        })

        if (fileUniqueIds.size === limit) {
          break
        }
      }

      if (fileUniqueIds.size === limit) {
        break
      }
    }

    return { fileUniqueIds, files }
  }
}
