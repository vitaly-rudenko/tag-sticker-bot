import { DeleteItemCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { encodeBitmap, decodeBitmap } from '../utils/bitmap.js'
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
          ...context.phase && {
            [attr.phase]: { S: context.phase },
          },
          ...context.tagInstructionMessageId && {
            [attr.tagInstructionMessageId]: { N: String(context.tagInstructionMessageId) },
          },
          ...context.stickerMessageId && {
            [attr.stickerMessageId]: { N: String(context.stickerMessageId) },
          },
          ...context.sticker && {
            ...context.sticker.set_name && { [attr.stickerSetName]: { S: context.sticker.set_name } },
            ...context.sticker.emoji && { [attr.stickerEmoji]: { S: context.sticker.emoji } },
            [attr.stickerFileUniqueId]: { S: context.sticker.file_unique_id },
            [attr.stickerFileId]: { S: context.sticker.file_id },
            [attr.stickerFormat]: { N: context.sticker.is_animated ? '1' : context.sticker.is_video ? '2' : '0' },
          },
          ...context.queue && {
            [attr.stickerSetName]: { S: context.queue.stickerSetName },
            [attr.queueStickerSetBitmap]: { S: encodeBitmap(context.queue.stickerSetBitmap.bitmap) },
            [attr.queueStickerSetBitmapLength]: { N: String(context.queue.stickerSetBitmap.length) },
            [attr.queueStickerSetBitmapSize]: { N: String(context.queue.stickerSetBitmap.size) },
            [attr.queuePosition]: { N: String(context.queue.position) },
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

    const phase = Item[attr.phase]?.S
    const stickerSetName = Item[attr.stickerSetName]?.S
    const stickerFileUniqueId = Item[attr.stickerFileUniqueId]?.S
    const stickerFileId = Item[attr.stickerFileId]?.S
    const stickerMessageId = Item[attr.stickerMessageId]?.N
    const stickerFormat = Item[attr.stickerFormat]?.N
    const stickerEmoji = Item[attr.stickerEmoji]?.S
    const tagInstructionMessageId = Item[attr.tagInstructionMessageId]?.N
    const queueStickerSetBitmap = Item[attr.queueStickerSetBitmap]?.S
    const queueStickerSetBitmapLength = Item[attr.queueStickerSetBitmapLength]?.N
    const queueStickerSetBitmapSize = Item[attr.queueStickerSetBitmapSize]?.N
    const queuePosition = Item[attr.queuePosition]?.N

    return Item ? {
      ...phase && { phase },
      ...stickerFileUniqueId && stickerFileId && stickerFormat && {
        sticker: {
          set_name: stickerSetName,
          file_unique_id: stickerFileUniqueId,
          file_id: stickerFileId,
          is_animated: stickerFormat === '1',
          is_video: stickerFormat === '2',
          emoji: stickerEmoji,
        }
      },
      ...stickerMessageId && { stickerMessageId: Number(stickerMessageId) },
      ...tagInstructionMessageId && { tagInstructionMessageId: Number(tagInstructionMessageId) },
      ...stickerSetName && queueStickerSetBitmap && queueStickerSetBitmapLength && queuePosition && queueStickerSetBitmapSize && {
        queue: {
          position: Number(queuePosition),
          stickerSetName: stickerSetName,
          stickerSetBitmap: {
            bitmap: decodeBitmap(queueStickerSetBitmap, Number(queueStickerSetBitmapLength)),
            length: Number(queueStickerSetBitmapLength),
            size: Number(queueStickerSetBitmapSize),
          },
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
