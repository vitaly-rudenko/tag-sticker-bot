import { BatchGetItemCommand, PutItemCommand, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb'
import { Tag } from './Tag.js'

export class DynamodbTagRepository {
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

  async setTag({ stickerSetName, stickerFileId, authorUserId, value }) {
    await this._dynamodbClient.send(
      new PutItemCommand({
        TableName: this._tableName,
        Item: this._toAttributes(
          new Tag({
            stickerSetName,
            stickerFileId,
            authorUserId,
            value,
          })
        )
      })
    )
  }

  /**
   * 
   * @param {{
   *   stickerFileIds: string[]
   *   authorUserId?: string
   * }} input
   */
  async queryTags({ stickerFileIds, authorUserId }) {
    const tags = []

    for (let i = 0; i < stickerFileIds.length; i += 100) {
      let lastEvaluatedKey = undefined
  
      do {
        const keys = []
        const values = {}
  
        for (const [index, stickerFileId] of stickerFileIds.slice(i, i + 100).entries()) {
          const key = `:stickerFileId${index}`
          keys.push(key)
          values[key] = { S: stickerFileId }
        }
  
        const conditionExpression = `stickerFileId IN (${keys.join(', ')})`
  
        console.log({
          TableName: this._tableName,
          KeyConditionExpression: authorUserId
            ? `${conditionExpression} and authorUserId IN (:authorUserId)`
            : conditionExpression,
          ExpressionAttributeValues: {
            ...authorUserId && { ':authorUserId': { S: authorUserId } },
            ...values,
          },
          ExclusiveStartKey: lastEvaluatedKey,
        })

        const { Items = [], LastEvaluatedKey } = await this._dynamodbClient.send(
          new QueryCommand({
            TableName: this._tableName,
            KeyConditionExpression: authorUserId
              ? `${conditionExpression} and authorUserId IN (:authorUserId)`
              : conditionExpression,
            ExpressionAttributeValues: {
              ...authorUserId && { ':authorUserId': { S: authorUserId } },
              ...values,
            },
            ExclusiveStartKey: lastEvaluatedKey,
          })
        )
  
        tags.push(...Items.map(item => this._toEntity(item)))
        lastEvaluatedKey = LastEvaluatedKey
      } while (lastEvaluatedKey)
    }

    return tags
  }

  /** @returns {Promise<import('./Tag').Tag[]>} */
  async searchTags({ query, authorUserId = undefined }) {
    // TODO: use CloudSearch
    const { Items = [] } = await this._dynamodbClient.send(
      new ScanCommand({
        TableName: this._tableName,
      })
    )

    return Items
      .map(item => this._toEntity(item))
      .filter(tag => tag.value.includes(query) && (!authorUserId || tag.authorUserId === authorUserId))
  }

  _toAttributes(tag) {
    return {
      stickerSetName: {
        S: tag.stickerSetName,
      },
      stickerFileId: {
        S: tag.stickerFileId,
      },
      authorUserId: {
        S: tag.authorUserId,
      },
      value: {
        S: tag.value,
      },
    }
  }

  _toEntity(attributes) {
    return new Tag({
      stickerSetName: attributes.stickerSetName.S,
      stickerFileId: attributes.stickerFileId.S,
      authorUserId: attributes.authorUserId.S,
      value: attributes.value.S,
    })
  }
}
