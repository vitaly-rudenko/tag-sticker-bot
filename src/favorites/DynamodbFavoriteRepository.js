import { DeleteItemCommand, GetItemCommand, PutItemCommand, QueryCommand, paginateQuery } from '@aws-sdk/client-dynamodb'
import { favoriteAttributes as attr } from './attributes.js'

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
   *   sticker: import('../types.d.ts').Sticker
   * }} input
   */
  async mark({ userId, sticker }) {
    const { ConsumedCapacity } = await this._dynamodbClient.send(
      new PutItemCommand({
        TableName: this._tableName,
        Item: {
          [attr.userId]: { S: userId },
          [attr.stickerFileId]: { S: sticker.file_id },
          [attr.stickerFileUniqueId]: { S: sticker.file_unique_id },
          [attr.stickerFormat]: { N: sticker.is_animated ? '1' : sticker.is_video ? '2' : '0' },
          ...sticker.set_name && { [attr.stickerSetName]: { S: sticker.set_name } },
          ...sticker.emoji && { [attr.stickerEmoji]: { S: sticker.emoji } },
        },
        ReturnConsumedCapacity: 'TOTAL',
      })
    )

    console.log('DynamodbFavoriteRepository#mark', { ConsumedCapacity })
  }

  /**
   * @param {{
   *   userId: string
   *   stickerFileUniqueId: string
   * }} input
   */
  async unmark({ userId, stickerFileUniqueId }) {
    const { ConsumedCapacity } = await this._dynamodbClient.send(
      new DeleteItemCommand({
        TableName: this._tableName,
        Key: {
          [attr.userId]: { S: userId },
          [attr.stickerFileUniqueId]: { S: stickerFileUniqueId },
        },
        ReturnConsumedCapacity: 'TOTAL',
      })
    )

    console.log('DynamodbFavoriteRepository#unmark', { ConsumedCapacity })
  }

  /**
   * @param {{
   *   userId: string
   *   limit: number
   *   fromStickerFileUniqueId?: string
   * }} input
   * @returns {Promise<import('../types.d.ts').Sticker[]>}
   */
  async query({ userId, limit, fromStickerFileUniqueId }) {
      /** @type {import('../types.d.ts').Sticker[]} */
    const stickers = []

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
      ...fromStickerFileUniqueId && {
        ExclusiveStartKey: {
          [attr.userId]: { S: userId },
          [attr.stickerFileUniqueId]: { S: fromStickerFileUniqueId },
        }
      }
    })

    for await (const { ConsumedCapacity, ScannedCount, Items } of favoritePaginator) {
      console.log('DynamodbFavoriteRepository#query', { ConsumedCapacity, ScannedCount })

      if (!Items) continue
      for (const item of Items) {
        const stickerFileId = item[attr.stickerFileId]?.S
        const stickerFileUniqueId = item[attr.stickerFileUniqueId]?.S
        const stickerFormat = item[attr.stickerFormat]?.N
        if (!stickerFileUniqueId || !stickerFileId || !stickerFormat) continue
        
        const stickerSetName = item[attr.stickerSetName]?.S
        const stickerEmoji = item[attr.stickerEmoji]?.S

        stickers.push({
          ...stickerSetName && { set_name: stickerSetName },
          ...stickerEmoji && { emoji: stickerEmoji },
          file_unique_id: stickerFileUniqueId,
          file_id: stickerFileId,
          is_animated: stickerFormat === '1',
          is_video: stickerFormat === '2',
        })

        if (stickers.length === limit) break
      }

      if (stickers.length === limit) break
    }

    return stickers
  }

  /**
   * @param {{
   *   userId: string
   *   stickerFileUniqueId: string
   * }} input
   */
  async isMarked({ userId, stickerFileUniqueId }) {
    const { Item, ConsumedCapacity } = await this._dynamodbClient.send(
      new GetItemCommand({
        TableName: this._tableName,
        Key: {
          [attr.userId]: { S: userId },
          [attr.stickerFileUniqueId]: { S: stickerFileUniqueId },
        },
        ReturnConsumedCapacity: 'TOTAL',
        ProjectionExpression: '#userId',
        ExpressionAttributeNames: {
          '#userId': attr.userId,
        },
      })
    )
  
    console.log('DynamodbFavoriteRepository#isMarked', { ConsumedCapacity })

    return Boolean(Item)
  }
}
