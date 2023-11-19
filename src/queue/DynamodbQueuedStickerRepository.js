import { BatchWriteItemCommand, DeleteItemCommand, QueryCommand, ReturnValue } from '@aws-sdk/client-dynamodb'
import { calculateExpiresAt } from '../utils/calculateExpiresAt.js'

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
                    ...this._toAttributes({
                      userId,
                      sticker,
                    }),
                    exp: {
                      N: String(calculateExpiresAt(EXPIRATION_TIME_S)),
                    }
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
        KeyConditionExpression: '#u = :user',
        ExpressionAttributeNames: {
          '#u': 'user'
        },
        ExpressionAttributeValues: {
          ':user': {
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
          user: Items[0].user,
          uid: Items[0].uid,
        },
        ReturnValues: ReturnValue.ALL_OLD,
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
          KeyConditionExpression: '#u = :user',
          ExpressionAttributeNames: {
            '#u': 'user'
          },
          ExpressionAttributeValues: {
            ':user': {
              S: userId,
            },
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
                      user: item.user,
                      uid: item.uid,
                    }
                  }
                }))
            }
          })
        )
      }
    } while (lastEvaluatedKey)
  }

  async count(userId) {
    const { Count } = await this._dynamodbClient.send(
      new QueryCommand({
        TableName: this._tableName,
        KeyConditionExpression: '#u = :user',
        ExpressionAttributeNames: {
          '#u': 'user'
        },
        ExpressionAttributeValues: {
          ':user': {
            S: userId,
          },
        },
      })
    )

    return Count ?? 0
  }

  /** @param {import('../types.d.ts').QueuedSticker} queuedSticker */
  _toAttributes(queuedSticker) {
    return {
      user: {
        S: String(queuedSticker.userId),
      },
      id: {
        S: queuedSticker.sticker.fileId,
      },
      uid: {
        S: queuedSticker.sticker.fileUniqueId,
      },
      set: {
        S: queuedSticker.sticker.setName,
      },
    }
  }
  
  /** @returns {import('../types.d.ts').QueuedSticker} */
  _toEntity(attributes) {
    return {
      userId: attributes.user.S,
      sticker: {
        setName: attributes.set.S,
        fileUniqueId: attributes.uid.S,
        fileId: attributes.id.S,
      }
    }
  }
}
