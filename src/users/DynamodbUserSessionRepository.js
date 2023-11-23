import { DeleteItemCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { bitmapToInt, intToBitmap } from '../utils/bitmap.js'
import { calculateExpiresAt } from '../utils/calculateExpiresAt.js'
import { userSessionAttributes as attr } from './attributes.js'

const EXPIRATION_TIME_S = 60 * 60 // 1 hour

export class DynamodbUserSessionRepository {
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
   * @param {string} userId
   * @param {import('../types.d.ts').UserSessionContext} context
   */
  async set(userId, context) {
    if (
      context.sticker?.set_name && context.queue?.stickerSetName &&
      context.sticker.set_name !== context.queue?.stickerSetName
    ) {
      throw new Error('Sticker set and queue set do not match')
    }

    const { ConsumedCapacity } = await this._dynamodbClient.send(
      new PutItemCommand({
        TableName: this._tableName,
        Item: {
          [attr.userId]: { S: userId },
          [attr.expiresAt]: { N: String(calculateExpiresAt(EXPIRATION_TIME_S)) },
          ...context.relevantMessageIds && {
            [attr.relevantMessageIds]: { NS: context.relevantMessageIds.map(String) },
          },
          ...context.stickerMessageId && {
            [attr.stickerMessageId]: { N: String(context.stickerMessageId) },
          },
          ...context.sticker && {
            ...context.sticker.set_name && { [attr.stickerSetName]: { S: context.sticker.set_name } },
            [attr.stickerFileUniqueId]: { S: context.sticker.file_unique_id },
            [attr.stickerFileId]: { S: context.sticker.file_id },
          },
          ...context.queue && {
            [attr.stickerSetName]: { S: context.queue.stickerSetName },
            [attr.queueStickerSetBitmap]: { S: bitmapToInt(context.queue.stickerSetBitmap) },
            [attr.queueIndex]: { N: String(context.queue.index) },
            [attr.queueSize]: { N: String(context.queue.size) },
          },
        },
        ReturnConsumedCapacity: 'TOTAL',
      })
    )

    console.log('DynamodbUserSessionRepository#set:putItem', { ConsumedCapacity })
  }

  /** @returns {Promise<import('../types.d.ts').UserSessionContext>} */
  async get(userId) {
    const { Item, ConsumedCapacity } = await this._dynamodbClient.send(
      new GetItemCommand({
        TableName: this._tableName,
        Key: {
          [attr.userId]: { S: userId }
        },
        ReturnConsumedCapacity: 'TOTAL',
      })
    )

    console.log('DynamodbUserSessionRepository#get:getItem', { ConsumedCapacity })

    if (!Item) return {}

    const stickerSetName = Item[attr.stickerSetName]?.S
    const stickerFileUniqueId = Item[attr.stickerFileUniqueId]?.S
    const stickerFileId = Item[attr.stickerFileId]?.S
    const stickerMessageId = Item[attr.stickerMessageId]?.N
    const relevantMessageIds = Item[attr.relevantMessageIds]?.NS
    const queueStickerSetBitmap = Item[attr.queueStickerSetBitmap]?.S
    const queueIndex = Item[attr.queueIndex]?.N
    const queueSize = Item[attr.queueSize]?.N

    return Item ? {
      ...stickerFileUniqueId && stickerFileId && {
        sticker: {
          set_name: stickerSetName,
          file_unique_id: stickerFileUniqueId,
          file_id: stickerFileId,
        }
      },
      ...stickerMessageId && { stickerMessageId: Number(stickerMessageId) },
      ...relevantMessageIds && { relevantMessageIds: relevantMessageIds.map(Number) },
      ...stickerSetName && queueStickerSetBitmap && queueIndex && queueSize && {
        queue: {
          stickerSetName: stickerSetName,
          stickerSetBitmap: intToBitmap(queueStickerSetBitmap, Number(queueSize)),
          index: Number(queueIndex),
          size: Number(queueSize),
        }
      },
    } : {}
  }

  async clear(userId) {
    const { ConsumedCapacity } = await this._dynamodbClient.send(
      new DeleteItemCommand({
        TableName: this._tableName,
        Key: {
          [attr.userId]: { S: userId },
        },
        ReturnConsumedCapacity: 'TOTAL',
      })
    )

    console.log('DynamodbUserSessionRepository#clear:deleteItem', { ConsumedCapacity })
  }
}
