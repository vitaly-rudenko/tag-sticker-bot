import { DeleteItemCommand, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'
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
   * @param {import('../types.d.ts').UserSessionContext} newContext
   */
  async amendContext(userId, newContext) {
    const oldContext = await this.getContext(userId)

    await this._dynamodbClient.send(
      new PutItemCommand({
        TableName: this._tableName,
        Item: {
          [attr.userId]: { S: userId },
          [attr.context]: { S: JSON.stringify({ ...oldContext, ...newContext }) },
          [attr.expiresAt]: { N: String(calculateExpiresAt(EXPIRATION_TIME_S)) }
        }
      })
    )
  }

  async clearContext(userId) {
    await this._dynamodbClient.send(
      new DeleteItemCommand({
        TableName: this._tableName,
        Key: {
          [attr.userId]: { S: userId }
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
          [attr.userId]: { S: userId }
        }
      })
    )

    const context = Item?.[attr.context]?.S
    return context ? JSON.parse(context) : {}
  }
}
