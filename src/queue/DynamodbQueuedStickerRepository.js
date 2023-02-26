import { BatchWriteItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { QueuedSticker } from './QueuedSticker.js'

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
   *   stickers: {
   *     stickerSetName: string
   *     stickerFileId: string
   *   }[]
   * }} input
   */
  async enqueue({ userId, stickers }) {
    for (let i = 0; i < stickers.length; i += 25) {
      await this._dynamodbClient.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [this._tableName]: stickers.slice(i, i + 25).map(sticker => ({
              PutRequest: {
                Item: this._toAttributes({
                  userId,
                  stickerFileId: sticker.stickerFileId,
                  stickerSetName: sticker.stickerSetName,
                })
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
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': {
            S: userId,
          },
        },
        Limit: 1,
      })
    )
    
    if (Items.length === 0) return undefined

    const { Attributes } = await this._dynamodbClient.send(
      new DeleteItemCommand({
        TableName: this._tableName,
        Key: {
          userId: Items[0].userId,
          stickerFileId: Items[0].stickerFileId,
        },
        ReturnValues: 'ALL_OLD',
      })
    )

    return Attributes ? this._toEntity(Attributes) : undefined
  }

  async clear(userId) {
    let lastEvaluatedKey = undefined

    do {
      const { Items = [], LastEvaluatedKey } = await this._dynamodbClient.send(
        new QueryCommand({
          TableName: this._tableName,
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':userId': {
              S: userId,
            },
          },
          ExclusiveStartKey: lastEvaluatedKey,
        })
      )

      lastEvaluatedKey = LastEvaluatedKey

      if (Items.length === 0) continue

      await this._dynamodbClient.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [this._tableName]: Items.map(item => ({
              DeleteRequest: {
                Key: {
                  userId: item.userId,
                  stickerFileId: item.stickerFileId,
                }
              }
            }))
          }
        })
      )
    } while (lastEvaluatedKey)
  }

  async count(userId) {
    const { Count } = await this._dynamodbClient.send(
      new QueryCommand({
        TableName: this._tableName,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': {
            S: userId,
          },
        },
      })
    )

    return Count ?? 0
  }

  /** @param {import('./QueuedSticker').QueuedSticker} queuedSticker */
  _toAttributes(queuedSticker) {
    return {
      stickerFileId: {
        S: queuedSticker.stickerFileId,
      },
      userId: {
        S: String(queuedSticker.userId),
      },
      stickerSetName: {
        S: queuedSticker.stickerSetName,
      },
    }
  }
  
  /** @returns {import('./QueuedSticker').QueuedSticker} */
  _toEntity(attributes) {
    return new QueuedSticker({
      userId: attributes.userId.S,
      stickerSetName: attributes.stickerSetName.S,
      stickerFileId: attributes.stickerFileId.S,
    })
  }
}
