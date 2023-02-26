import { GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'

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
