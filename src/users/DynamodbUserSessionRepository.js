import { DeleteItemCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { calculateExpiresAt } from '../utils/calculateExpiresAt.js'

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
   * @param {import('../types.d.ts').UserSessionContext} newContext
   */
  async amendContext(userId, newContext) {
    const oldContext = await this.getContext(userId)

    await this._dynamodbClient.send(
      new PutItemCommand({
        TableName: this._tableName,
        Item: {
          user: {
            S: userId,
          },
          ctx: {
            S: JSON.stringify({ ...oldContext, ...newContext }),
          },
          exp: {
            N: String(calculateExpiresAt(EXPIRATION_TIME_S)),
          }
        }
      })
    )
  }

  async clearContext(userId) {
    await this._dynamodbClient.send(
      new DeleteItemCommand({
        TableName: this._tableName,
        Key: {
          user: { S: userId }
        }
      })
    )
  }

  /** @returns {Promise<import('../types.d.ts').UserSessionContext>} */
  async getContext(userId) {
    const { Item } = await this._dynamodbClient.send(
      new GetItemCommand({
        TableName: this._tableName,
        Key: {
          user: { S: userId }
        }
      })
    )

    return Item?.ctx?.S ? JSON.parse(Item.ctx.S) : {}
  }
}
