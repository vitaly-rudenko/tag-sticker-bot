import { BatchGetItemCommand, PutItemCommand, QueryCommand, ScanCommand } from '@aws-sdk/client-dynamodb'
import { Tag } from './Tag.js'

// TODO: do not return duplicates in responses
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

  /** @param {Tag} tag */
  async storeTag(tag) {
    await this._dynamodbClient.send(
      new PutItemCommand({
        TableName: this._tableName,
        Item: this._toAttributes(tag)
      })
    )
  }

  /**
   * @param {{
   *   stickerFileIds: string[]
   *   authorUserId?: string
   * }} input
   */
  async queryTags({ stickerFileIds, authorUserId }) {
    const tags = []

    if (authorUserId) {
      for (let i = 0; i < stickerFileIds.length; i += 100) {
        const { Responses } = await this._dynamodbClient.send(
          new BatchGetItemCommand({
            RequestItems: {
              [this._tableName]: {
                Keys: stickerFileIds
                  .slice(i, i + 100)
                  .map(stickerFileId => ({
                    authorUserId: { S: authorUserId },
                    stickerFileId: { S: stickerFileId },
                  }))
              }
            }
          })
        )

        if (Responses?.[this._tableName]) {
          tags.push(...Responses[this._tableName].map(item => this._toEntity(item)))
        }
      }
    } else {
      for (const stickerFileId of stickerFileIds) {
        let lastEvaluatedKey = undefined

        do {
          const { Items, LastEvaluatedKey } = await this._dynamodbClient.send(
            new QueryCommand({
              TableName: this._tableName,
              IndexName: 'stickerFileId',
              KeyConditionExpression: 'stickerFileId = :stickerFileId',
              ExpressionAttributeValues: {
                ':stickerFileId': { S: stickerFileId }
              },
              ExclusiveStartKey: lastEvaluatedKey,
            })
          )

          if (Items) {
            tags.push(...Items.map(item => this._toEntity(item)))
          }

          lastEvaluatedKey = LastEvaluatedKey
        } while (lastEvaluatedKey)
      }
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
      .filter(tag => tag.value.includes(query.toLowerCase()) && (!authorUserId || tag.authorUserId === authorUserId))
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
