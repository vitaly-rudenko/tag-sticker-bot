import { BatchWriteItemCommand, DeleteItemCommand, QueryCommand, ReturnValue } from '@aws-sdk/client-dynamodb'
import { calculateExpiresAt } from '../utils/calculateExpiresAt.js'
import { queuedStickerAttributes as attr } from './attributes.js'

const BATCH_WRITE_ITEM_LIMIT = 25
const EXPIRATION_TIME_S = 60 * 60 // 1 hour

export class DynamodbQueuedStickerRepository {
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
   * @param {{
   *   userId: string
   *   stickers: import('../types.d.ts').Sticker[]
   * }} input
   */
  async enqueue({ userId, stickers }) {
    for (let i = 0; i < stickers.length; i += BATCH_WRITE_ITEM_LIMIT) {
      await this._dynamodbClient.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [this._tableName]: stickers
              .slice(i, i + BATCH_WRITE_ITEM_LIMIT)
              .map(sticker => ({
                PutRequest: {
                  Item: {
                    [attr.userId]: { S: String(userId) },
                    [attr.stickerFileId]: { S: sticker.fileId },
                    [attr.stickerFileUniqueId]: { S: sticker.fileUniqueId },
                    [attr.stickerSetName]: { S: sticker.setName },
                    [attr.expiresAt]: { N: String(calculateExpiresAt(EXPIRATION_TIME_S)) }
                  }
                }
              }))
          }
        })
      )
    }
  }

  async take(userId) {
    const { Items = [] } = await this._dynamodbClient.send(
      new QueryCommand({
        TableName: this._tableName,
        KeyConditionExpression: '#userId = :userId',
        ExpressionAttributeNames: {
          '#userId': attr.userId,
        },
        ExpressionAttributeValues: {
          ':userId': { S: userId },
        },
        Limit: 1,
      })
    )
    
    if (Items.length === 0) return undefined

    const { Attributes } = await this._dynamodbClient.send(
      new DeleteItemCommand({
        TableName: this._tableName,
        Key: {
          [attr.userId]: Items[0][attr.userId],
          [attr.stickerFileUniqueId]: Items[0][attr.stickerFileUniqueId],
        },
        ReturnValues: ReturnValue.ALL_OLD,
      })
    )

    return Attributes ? this._toEntity(Attributes) : undefined
  }

  async clear(userId) {
    let lastEvaluatedKey
    do {
      const { Items = [], LastEvaluatedKey } = await this._dynamodbClient.send(
        new QueryCommand({
          TableName: this._tableName,
          KeyConditionExpression: '#userId = :userId',
          ExpressionAttributeNames: {
            '#userId': attr.userId,
          },
          ExpressionAttributeValues: {
            ':userId': { S: userId },
          },
          ExclusiveStartKey: lastEvaluatedKey,
        })
      )

      lastEvaluatedKey = LastEvaluatedKey

      if (Items.length === 0) continue

      for (let i = 0; i < Items.length; i += BATCH_WRITE_ITEM_LIMIT) {
        await this._dynamodbClient.send(
          new BatchWriteItemCommand({
            RequestItems: {
              [this._tableName]: Items
                .slice(i, i + BATCH_WRITE_ITEM_LIMIT)
                .map(item => ({
                  DeleteRequest: {
                    Key: {
                      [attr.userId]: item[attr.userId],
                      [attr.stickerFileUniqueId]: item[attr.stickerFileUniqueId],
                    }
                  }
                }))
            }
          })
        )
      }
    } while (lastEvaluatedKey)
  }

  async empty(userId) {
    const { Items = [] } = await this._dynamodbClient.send(
      new QueryCommand({
        TableName: this._tableName,
        KeyConditionExpression: '#userId = :userId',
        ExpressionAttributeNames: {
          '#userId': attr.userId,
        },
        ExpressionAttributeValues: {
          ':userId': { S: userId },
        },
        Limit: 1,
      })
    )

    return Items.length === 0
  }
  
  /** @returns {import('../types.d.ts').QueuedSticker} */
  _toEntity(attributes) {
    return {
      userId: attributes[attr.userId].S,
      sticker: {
        setName: attributes[attr.stickerSetName].S,
        fileUniqueId: attributes[attr.stickerFileUniqueId].S,
        fileId: attributes[attr.stickerFileId].S,
      }
    }
  }
}
