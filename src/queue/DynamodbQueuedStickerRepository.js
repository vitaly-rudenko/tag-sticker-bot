import { BatchWriteItemCommand, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'

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
   *   stickers: Sticker[]
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
                  sticker,
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
          stickerFileUniqueId: Items[0].stickerFileUniqueId,
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

      for (let i = 0; i < Items.length; i += 25) {
        await this._dynamodbClient.send(
          new BatchWriteItemCommand({
            RequestItems: {
              [this._tableName]: Items
                .slice(i, i + 25)
                .map(item => ({
                  DeleteRequest: {
                    Key: {
                      userId: item.userId,
                      stickerFileUniqueId: item.stickerFileUniqueId,
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

  /** @param {QueuedSticker} queuedSticker */
  _toAttributes(queuedSticker) {
    return {
      userId: {
        S: String(queuedSticker.userId),
      },
      stickerFileId: {
        S: queuedSticker.sticker.fileId,
      },
      stickerFileUniqueId: {
        S: queuedSticker.sticker.fileUniqueId,
      },
      stickerSetName: {
        S: queuedSticker.sticker.setName,
      },
    }
  }
  
  /** @returns {QueuedSticker} */
  _toEntity(attributes) {
    return {
      userId: attributes.userId.S,
      sticker: {
        setName: attributes.stickerSetName.S,
        fileUniqueId: attributes.stickerFileUniqueId.S,
        fileId: attributes.stickerFileId.S,
      }
    }
  }
}
