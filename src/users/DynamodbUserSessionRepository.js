import { DeleteItemCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { encodeBitmap, decodeBitmap } from '../utils/bitmap.js'
import { calculateExpiresAt } from '../utils/calculateExpiresAt.js'
import { userSessionAttributes as attr } from './attributes.js'
import { logger } from '../logger.js'
import { decodeMimeType, encodeMimeType } from '../utils/mimeType.js'

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
      context.file?.set_name && context.queue?.stickerSetName &&
      context.file.set_name !== context.queue?.stickerSetName
    ) {
      throw new Error('Sticker set and queue set do not match')
    }

    const { ConsumedCapacity } = await this._dynamodbClient.send(
      new PutItemCommand({
        TableName: this._tableName,
        Item: {
          [attr.userId]: { S: userId },
          [attr.isPrivate]: { BOOL: context.isPrivate },
          [attr.expiresAt]: { N: String(calculateExpiresAt(EXPIRATION_TIME_S)) },
          ...context.phase && {
            [attr.phase]: { S: context.phase },
          },
          ...context.tagInstructionMessageId && {
            [attr.tagInstructionMessageId]: { N: String(context.tagInstructionMessageId) },
          },
          ...context.fileMessageId && {
            [attr.fileMessageId]: { N: String(context.fileMessageId) },
          },
          ...context.file && {
            ...context.file.set_name && { [attr.stickerSetName]: { S: context.file.set_name } },
            ...context.file.mime_type && { [attr.animationMimeType]: { N: encodeMimeType(context.file.mime_type) } },
            [attr.fileUniqueId]: { S: context.file.file_unique_id },
            [attr.fileId]: { S: context.file.file_id },
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

    logger.debug({ ConsumedCapacity }, 'DynamodbUserSessionRepository#set:putItem')
  }

  /**
   * @param {string} userId
   * @returns {Promise<import('../types.d.ts').UserSessionContext>}
   */
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

    logger.debug({ ConsumedCapacity }, 'DynamodbUserSessionRepository#get:getItem')

    if (!Item) return { isPrivate: false }

    const isPrivate = Item[attr.isPrivate]?.BOOL
    const phase = Item[attr.phase]?.S
    const stickerSetName = Item[attr.stickerSetName]?.S
    const animationMimeType = decodeMimeType(Item[attr.animationMimeType]?.N)
    const fileUniqueId = Item[attr.fileUniqueId]?.S
    const fileId = Item[attr.fileId]?.S
    const fileMessageId = Item[attr.fileMessageId]?.N
    const tagInstructionMessageId = Item[attr.tagInstructionMessageId]?.N
    const queueStickerSetBitmap = Item[attr.queueStickerSetBitmap]?.S
    const queueStickerSetBitmapLength = Item[attr.queueStickerSetBitmapLength]?.N
    const queueStickerSetBitmapSize = Item[attr.queueStickerSetBitmapSize]?.N
    const queuePosition = Item[attr.queuePosition]?.N

    return {
      isPrivate: isPrivate ?? false,
      ...phase && { phase },
      ...fileUniqueId && fileId && {
        file: {
          file_id: fileId,
          file_unique_id: fileUniqueId,
          set_name: stickerSetName,
          mime_type: animationMimeType,
        }
      },
      ...fileMessageId && { fileMessageId: Number(fileMessageId) },
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
    }
  }

  /** @param {string} userId */
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

    logger.debug({ ConsumedCapacity }, 'DynamodbUserSessionRepository#clear:deleteItem')
  }
}
