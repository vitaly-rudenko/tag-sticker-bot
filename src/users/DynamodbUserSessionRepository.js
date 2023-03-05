import { DeleteItemCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'

/**
 * @typedef Context
 * @property {Sticker} [sticker]
 * @property {number} [stickerMessageId]
 */

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
   * @param {Context} newContext
   */
  async amendContext(userId, newContext) {
    const oldContext = await this.getContext(userId)

    await this._dynamodbClient.send(
      new PutItemCommand({
        TableName: this._tableName,
        Item: {
          userId: { S: userId },
          context: { S: JSON.stringify({ ...oldContext, ...newContext }) },
        }
      })
    )
  }

  async clearContext(userId) {
    await this._dynamodbClient.send(
      new DeleteItemCommand({
        TableName: this._tableName,
        Key: {
          userId: { S: userId }
        }
      })
    )
  }

  /** @returns {Promise<Context>} */
  async getContext(userId) {
    const { Item } = await this._dynamodbClient.send(
      new GetItemCommand({
        TableName: this._tableName,
        Key: {
          userId: { S: userId }
        }
      })
    )

    return Item?.context?.S ? JSON.parse(Item.context.S) : {}
  }
}
