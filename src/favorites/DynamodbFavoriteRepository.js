import { DeleteItemCommand, GetItemCommand, PutItemCommand, paginateQuery } from '@aws-sdk/client-dynamodb'
import { favoriteAttributes as attr } from './attributes.js'
import { logger } from '../logger.js'
import { decodeMimeType, encodeMimeType } from '../utils/mimeType.js'

export class DynamodbFavoriteRepository {
  /**
   * @param {{
   *   dynamodbClient: import('@aws-sdk/client-dynamodb').DynamoDBClient,
   *   tableName: string
   * }} options
   */
  constructor({ dynamodbClient, tableName }) {
    this._dynamodbClient = dynamodbClient
    this._tableName = tableName
    this._queryPageSize = 100
  }

  /**
   * @param {{
   *   userId: string
   *   file: import('../types.d.ts').File
   * }} input
   */
  async mark({ userId, file }) {

    const { ConsumedCapacity } = await this._dynamodbClient.send(
      new PutItemCommand({
        TableName: this._tableName,
        Item: {
          [attr.userId]: { S: userId },
          [attr.fileId]: { S: file.file_id },
          [attr.fileUniqueId]: { S: file.file_unique_id },
          ...file.set_name && { [attr.stickerSetName]: { S: file.set_name } },
          ...file.mime_type && { [attr.animationMimeType]: { N: encodeMimeType(file.mime_type) } },
        },
        ReturnConsumedCapacity: 'TOTAL',
      })
    )

    logger.debug({ ConsumedCapacity }, 'DynamodbFavoriteRepository#mark')
  }

  /**
   * @param {{
   *   userId: string
   *   fileUniqueId: string
   * }} input
   */
  async unmark({ userId, fileUniqueId }) {
    const { ConsumedCapacity } = await this._dynamodbClient.send(
      new DeleteItemCommand({
        TableName: this._tableName,
        Key: {
          [attr.userId]: { S: userId },
          [attr.fileUniqueId]: { S: fileUniqueId },
        },
        ReturnConsumedCapacity: 'TOTAL',
      })
    )

    logger.debug({ ConsumedCapacity }, 'DynamodbFavoriteRepository#unmark')
  }

  /**
   * @param {{
   *   userId: string
   *   limit: number
   *   fromFileUniqueId?: string
   * }} input
   * @returns {Promise<import('../types.d.ts').File[]>}
   */
  async query({ userId, limit, fromFileUniqueId }) {
      /** @type {import('../types.d.ts').File[]} */
    const files = []

    const favoritePaginator = paginateQuery({ client: this._dynamodbClient, pageSize: this._queryPageSize }, {
      TableName: this._tableName,
      KeyConditionExpression: '#userId = :userId',
      ExpressionAttributeNames: {
        '#userId': attr.userId,
      },
      ExpressionAttributeValues: {
        ':userId': { S: userId },
      },
      ReturnConsumedCapacity: 'TOTAL',
      ...fromFileUniqueId && {
        ExclusiveStartKey: {
          [attr.userId]: { S: userId },
          [attr.fileUniqueId]: { S: fromFileUniqueId },
        }
      }
    })

    for await (const { ConsumedCapacity, ScannedCount, Items } of favoritePaginator) {
      logger.debug({ ConsumedCapacity, ScannedCount }, 'DynamodbFavoriteRepository#query')

      if (!Items) continue
      for (const item of Items) {
        const fileId = item[attr.fileId]?.S
        const fileUniqueId = item[attr.fileUniqueId]?.S
        if (!fileUniqueId || !fileId) continue

        files.push({
          file_id: fileId,
          file_unique_id: fileUniqueId,
          set_name: item[attr.stickerSetName]?.S,
          mime_type: decodeMimeType(item[attr.animationMimeType]?.N),
        })

        if (files.length === limit) break
      }

      if (files.length === limit) break
    }

    return files
  }

  /**
   * @param {{
   *   userId: string
   *   fileUniqueId: string
   * }} input
   */
  async isMarked({ userId, fileUniqueId }) {
    const { Item, ConsumedCapacity } = await this._dynamodbClient.send(
      new GetItemCommand({
        TableName: this._tableName,
        Key: {
          [attr.userId]: { S: userId },
          [attr.fileUniqueId]: { S: fileUniqueId },
        },
        ReturnConsumedCapacity: 'TOTAL',
        ProjectionExpression: '#userId',
        ExpressionAttributeNames: {
          '#userId': attr.userId,
        },
      })
    )

    logger.debug({ ConsumedCapacity }, 'DynamodbFavoriteRepository#isMarked')

    return Boolean(Item)
  }
}
